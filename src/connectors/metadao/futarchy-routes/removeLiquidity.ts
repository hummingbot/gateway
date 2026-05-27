import { PublicKey, Transaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import {
  MetaDaoRemoveLiquidityRequest,
  MetaDaoRemoveLiquidityRequestType,
  MetaDaoRemoveLiquidityResponse,
  MetaDaoRemoveLiquidityResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { findDaoByBaseToken } from '../dao-lookup';
import { MetaDao } from '../metadao';

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: MetaDaoRemoveLiquidityRequestType;
    Reply: MetaDaoRemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from MetaDAO spot pool',
        tags: ['/connector/metadao'],
        body: MetaDaoRemoveLiquidityRequest,
        response: {
          200: MetaDaoRemoveLiquidityResponse,
        },
      },
    },
    async (request): Promise<MetaDaoRemoveLiquidityResponseType> => {
      const { baseToken, liquidityAmount, minBaseAmount, minQuoteAmount, slippagePct = 0.5 } = request.body;
      const network = request.body.network || 'mainnet-beta';

      try {
        // Look up DAO by baseToken
        const daoAddress = findDaoByBaseToken(baseToken);
        if (!daoAddress) {
          throw fastify.httpErrors.notFound(`No DAO found for baseToken: ${baseToken}`);
        }

        const metadao = await MetaDao.getInstance(network);
        const solana = metadao.getSolana();

        // Get wallet
        const walletAddress = request.body.walletAddress || getSolanaChainConfig().defaultWallet;
        if (!walletAddress) {
          throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet configured');
        }

        const wallet = await solana.getWallet(walletAddress);
        const lpPubkey = new PublicKey(walletAddress);

        // Fetch DAO account
        const daoAccount = await metadao.getDao(daoAddress);

        // Check pool state
        const poolStateType = metadao.getPoolStateType(daoAccount);
        if (poolStateType !== 'spot') {
          throw fastify.httpErrors.badRequest('Liquidity withdrawal is unavailable while a proposal market is active');
        }

        // Get token decimals
        const baseDecimals = await metadao.getTokenDecimals(daoAccount.baseMint.toString());
        const quoteDecimals = await metadao.getTokenDecimals(daoAccount.quoteMint.toString());

        // Get spot pool
        const spotPool = metadao.getSpotPool(daoAccount);

        const rawLiquidityAmount = metadao.toRawLiquidity(liquidityAmount, quoteDecimals);

        // Calculate expected outputs
        const { baseAmount: rawBaseAmount, quoteAmount: rawQuoteAmount } = metadao.calculateLiquidityWithdraw(
          rawLiquidityAmount,
          spotPool.baseReserves,
          spotPool.quoteReserves,
          daoAccount.totalLiquidity,
        );

        // Calculate min amounts with slippage
        const slippageMultiplier = Math.floor((1 - slippagePct / 100) * 10000);
        let rawMinBaseAmount = rawBaseAmount.muln(slippageMultiplier).divn(10000);
        let rawMinQuoteAmount = rawQuoteAmount.muln(slippageMultiplier).divn(10000);

        if (minBaseAmount !== undefined) {
          rawMinBaseAmount = metadao.toRawAmount(minBaseAmount, baseDecimals);
        }
        if (minQuoteAmount !== undefined) {
          rawMinQuoteAmount = metadao.toRawAmount(minQuoteAmount, quoteDecimals);
        }

        // Build remove liquidity instruction
        const removeLiquidityIx = await metadao.buildWithdrawLiquidityIx({
          dao: new PublicKey(daoAddress),
          liquidityProvider: lpPubkey,
          liquidityAmount: rawLiquidityAmount,
          minBaseAmount: rawMinBaseAmount,
          minQuoteAmount: rawMinQuoteAmount,
        });

        // Build and send transaction
        const connection = solana.connection;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const createBaseAtaIx = await metadao.buildCreateAtaIx(lpPubkey, daoAccount.baseMint);
        const createQuoteAtaIx = await metadao.buildCreateAtaIx(lpPubkey, daoAccount.quoteMint);

        const transaction = new Transaction({
          feePayer: lpPubkey,
          blockhash,
          lastValidBlockHeight,
        }).add(createBaseAtaIx, createQuoteAtaIx, removeLiquidityIx);

        // Sign and send
        transaction.sign(wallet);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed',
        );

        const status = confirmation.value.err ? -1 : 1;

        // Get position address
        const positionAddress = metadao.getAmmPositionAddress(daoAddress, walletAddress);

        return {
          signature,
          status,
          data: {
            pool: daoAddress,
            positionAddress: positionAddress.toString(),
            liquidityBurned: liquidityAmount,
            baseReceived: metadao.fromRawAmount(rawBaseAmount, baseDecimals),
            quoteReceived: metadao.fromRawAmount(rawQuoteAmount, quoteDecimals),
            fee: 0,
          },
        };
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error removing liquidity for baseToken ${baseToken}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to remove liquidity: ${error}`);
      }
    },
  );
};

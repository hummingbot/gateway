import { PublicKey, Transaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import {
  MetaDaoAddLiquidityRequest,
  MetaDaoAddLiquidityRequestType,
  MetaDaoAddLiquidityResponse,
  MetaDaoAddLiquidityResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { findDaoByBaseToken } from '../dao-lookup';
import { MetaDao } from '../metadao';

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: MetaDaoAddLiquidityRequestType;
    Reply: MetaDaoAddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to MetaDAO spot pool',
        tags: ['/connector/metadao'],
        body: MetaDaoAddLiquidityRequest,
        response: {
          200: MetaDaoAddLiquidityResponse,
        },
      },
    },
    async (request): Promise<MetaDaoAddLiquidityResponseType> => {
      const { baseToken, quoteAmount, maxBaseAmount, minLiquidity, slippagePct = 0.5 } = request.body;
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
          throw fastify.httpErrors.badRequest('Liquidity provision is unavailable while a proposal market is active');
        }

        // Get token decimals
        const baseDecimals = await metadao.getTokenDecimals(daoAccount.baseMint.toString());
        const quoteDecimals = await metadao.getTokenDecimals(daoAccount.quoteMint.toString());

        // Get spot pool
        const spotPool = metadao.getSpotPool(daoAccount);

        // Convert quote amount to raw
        const rawQuoteAmount = metadao.toRawAmount(quoteAmount, quoteDecimals);

        // Calculate base amount and liquidity if not provided
        const { baseAmount: rawBaseAmount, liquidityMinted: rawLiquidityMinted } = metadao.calculateLiquidityMint(
          rawQuoteAmount,
          spotPool.baseReserves,
          spotPool.quoteReserves,
          daoAccount.totalLiquidity,
        );

        // Calculate max base with slippage
        let rawMaxBaseAmount = rawBaseAmount.muln(Math.floor((1 + slippagePct / 100) * 10000)).divn(10000);
        if (maxBaseAmount !== undefined) {
          rawMaxBaseAmount = metadao.toRawAmount(maxBaseAmount, baseDecimals);
        }

        // Calculate min liquidity with slippage
        let rawMinLiquidity = rawLiquidityMinted.muln(Math.floor((1 - slippagePct / 100) * 10000)).divn(10000);
        if (minLiquidity !== undefined) {
          rawMinLiquidity = metadao.toRawLiquidity(minLiquidity, quoteDecimals);
        }

        // Build add liquidity instruction
        const addLiquidityIx = await metadao.buildProvideLiquidityIx({
          dao: new PublicKey(daoAddress),
          liquidityProvider: lpPubkey,
          quoteAmount: rawQuoteAmount,
          maxBaseAmount: rawMaxBaseAmount,
          minLiquidity: rawMinLiquidity,
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
        }).add(createBaseAtaIx, createQuoteAtaIx, addLiquidityIx);

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
            quoteDeposited: quoteAmount,
            baseDeposited: metadao.fromRawAmount(rawBaseAmount, baseDecimals),
            liquidityMinted: metadao.fromRawLiquidity(rawLiquidityMinted, quoteDecimals),
            fee: 0,
          },
        };
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error adding liquidity for baseToken ${baseToken}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to add liquidity: ${error}`);
      }
    },
  );
};

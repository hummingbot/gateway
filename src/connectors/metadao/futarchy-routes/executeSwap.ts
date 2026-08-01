import { PublicKey, Transaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import {
  MetaDaoExecuteSwapRequest,
  MetaDaoExecuteSwapRequestType,
  MetaDaoExecuteSwapResponse,
  MetaDaoExecuteSwapResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { findDaoByBaseToken } from '../dao-lookup';
import { MetaDao } from '../metadao';

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: MetaDaoExecuteSwapRequestType;
    Reply: MetaDaoExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a spot market swap on MetaDAO',
        tags: ['/connector/metadao'],
        body: MetaDaoExecuteSwapRequest,
        response: {
          200: MetaDaoExecuteSwapResponse,
        },
      },
    },
    async (request): Promise<MetaDaoExecuteSwapResponseType> => {
      const { baseToken, quoteToken = 'USDC', amount, side, slippagePct = 0.5 } = request.body;
      const network = request.body.network || 'mainnet-beta';

      try {
        // Look up DAO by baseToken and quoteToken
        const daoAddress = findDaoByBaseToken(baseToken, quoteToken);
        if (!daoAddress) {
          throw fastify.httpErrors.notFound(`No pool found for baseToken: ${baseToken}, quoteToken: ${quoteToken}`);
        }

        const metadao = await MetaDao.getInstance(network);
        const solana = metadao.getSolana();

        // Get wallet
        const walletAddress = request.body.walletAddress || getSolanaChainConfig().defaultWallet;
        if (!walletAddress) {
          throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet configured');
        }

        const wallet = await solana.getWallet(walletAddress);
        const traderPubkey = new PublicKey(walletAddress);

        // Fetch DAO account
        const daoAccount = await metadao.getDao(daoAddress);
        const baseMint = daoAccount.baseMint.toString();
        const quoteMint = daoAccount.quoteMint.toString();

        // Get token decimals
        const baseDecimals = await metadao.getTokenDecimals(baseMint);
        const quoteDecimals = await metadao.getTokenDecimals(quoteMint);
        const spotPool = metadao.getSpotPool(daoAccount);

        const rawBaseAmount = metadao.toRawAmount(amount, baseDecimals);
        const slippageMultiplier = 1 - slippagePct / 100;
        const maxSlippageMultiplier = 1 + slippagePct / 100;

        let rawInputAmount = rawBaseAmount;
        let rawMinOutput = metadao
          .calculateSwapOutput(
            rawInputAmount,
            spotPool.baseReserves,
            spotPool.quoteReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          )
          .output.muln(Math.floor(slippageMultiplier * 10000))
          .divn(10000);
        let swapType: 'BUY' | 'SELL' = 'SELL';
        let tokenIn = baseMint;
        let tokenOut = quoteMint;
        let amountIn = amount;
        let amountOut = metadao.fromRawAmount(rawMinOutput, quoteDecimals);

        if (side === 'BUY') {
          swapType = 'BUY';
          tokenIn = quoteMint;
          tokenOut = baseMint;
          const rawRequiredInput = metadao.calculateSwapInputForOutput(
            rawBaseAmount,
            spotPool.quoteReserves,
            spotPool.baseReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          );
          rawInputAmount = rawRequiredInput.muln(Math.floor(maxSlippageMultiplier * 10000)).divn(10000);
          rawMinOutput = rawBaseAmount;
          amountIn = metadao.fromRawAmount(rawInputAmount, quoteDecimals);
          amountOut = amount;
        }

        // Build swap instruction
        const swapIx = await metadao.buildSpotSwapIx({
          dao: new PublicKey(daoAddress),
          trader: traderPubkey,
          swapType: swapType.toLowerCase() as 'buy' | 'sell',
          inputAmount: rawInputAmount,
          minOutputAmount: rawMinOutput,
        });

        // Build and send transaction
        const connection = solana.connection;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const createBaseAtaIx = await metadao.buildCreateAtaIx(traderPubkey, daoAccount.baseMint);
        const createQuoteAtaIx = await metadao.buildCreateAtaIx(traderPubkey, daoAccount.quoteMint);

        const transaction = new Transaction({
          feePayer: traderPubkey,
          blockhash,
          lastValidBlockHeight,
        }).add(createBaseAtaIx, createQuoteAtaIx, swapIx);

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

        return {
          signature,
          status,
          data: {
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            fee: 0,
            baseTokenBalanceChange: side === 'BUY' ? amountOut : -amountIn,
            quoteTokenBalanceChange: side === 'BUY' ? -amountIn : amountOut,
          },
        };
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error executing swap for baseToken ${baseToken}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to execute swap: ${error}`);
      }
    },
  );
};

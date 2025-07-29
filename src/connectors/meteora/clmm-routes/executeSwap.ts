import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { ExecuteSwapResponseType, ExecuteSwapResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmExecuteSwapRequest, MeteoraClmmExecuteSwapRequestType } from '../schemas';

import { getRawSwapQuote } from './quoteSwap';

async function executeSwap(
  fastify: FastifyInstance,
  network: string,
  address: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  const {
    inputToken,
    outputToken,
    swapAmount,
    quote: swapQuote,
    dlmmPool,
  } = await getRawSwapQuote(
    fastify,
    network,
    baseTokenIdentifier,
    quoteTokenIdentifier,
    amount,
    side,
    poolAddress,
    slippagePct || MeteoraConfig.config.slippagePct,
  );

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`);

  const swapTx =
    side === 'BUY'
      ? await dlmmPool.swapExactOut({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          outAmount: (swapQuote as SwapQuoteExactOut).outAmount,
          maxInAmount: (swapQuote as SwapQuoteExactOut).maxInAmount,
          lbPair: dlmmPool.pubkey,
          user: wallet.publicKey,
          binArraysPubkey: (swapQuote as SwapQuoteExactOut).binArraysPubkey,
        })
      : await dlmmPool.swap({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          inAmount: swapAmount,
          minOutAmount: (swapQuote as SwapQuote).minOutAmount,
          lbPair: dlmmPool.pubkey,
          user: wallet.publicKey,
          binArraysPubkey: (swapQuote as SwapQuote).binArraysPubkey,
        });

  // Sign the transaction
  swapTx.sign(wallet);

  // Simulate transaction with proper error handling
  await solana.simulateWithErrorHandling(swapTx, fastify);

  // Send and confirm transaction
  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(swapTx);

  // Handle confirmation status
  const result = await solana.handleConfirmation(
    signature,
    confirmed,
    txData,
    inputToken.address,
    outputToken.address,
    wallet.publicKey.toBase58(),
    side,
  );

  if (result.status === 1) {
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${inputToken.symbol} -> ${result.data?.amountOut.toFixed(4)} ${outputToken.symbol}`,
    );
  }

  return result as ExecuteSwapResponseType;
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: MeteoraClmmExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a token swap on Meteora DLMM',
        tags: ['/connector/meteora'],
        body: MeteoraClmmExecuteSwapRequest,
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body;

        // Use defaults if not provided
        const networkUsed = network || getSolanaChainConfig().defaultNetwork;
        const walletAddressUsed = walletAddress || getSolanaChainConfig().defaultWallet;

        let poolAddressUsed = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressUsed) {
          const solana = await Solana.getInstance(networkUsed);

          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw fastify.httpErrors.badRequest(
              sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'meteora',
            networkUsed,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Meteora`,
            );
          }

          poolAddressUsed = pool.address;
        }
        logger.info(`Received swap request: ${amount} ${baseToken} -> ${quoteToken} in pool ${poolAddressUsed}`);

        return await executeSwap(
          fastify,
          networkUsed,
          walletAddressUsed,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressUsed,
          slippagePct,
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { ExecuteSwapOperation } from '@gateway-sdk/solana/meteora/operations/clmm';

import { Solana } from '../../../chains/solana/solana';
import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { ExecuteSwapResponseType, ExecuteSwapResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Meteora } from '../meteora';
import { MeteoraClmmExecuteSwapRequest, MeteoraClmmExecuteSwapRequestType } from '../schemas';

async function executeSwap(
  _fastify: FastifyInstance,
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

  // Resolve tokens
  const baseToken = await solana.getToken(baseTokenIdentifier);
  const quoteToken = await solana.getToken(quoteTokenIdentifier);

  const [tokenIn, tokenOut] =
    side === 'BUY' ? [quoteToken.address, baseToken.address] : [baseToken.address, quoteToken.address];
  const amountIn = side === 'SELL' ? amount : undefined;
  const amountOut = side === 'BUY' ? amount : undefined;

  // Create SDK operation
  const operation = new ExecuteSwapOperation(meteora, solana);

  // Execute using SDK
  const result = await operation.execute({
    network,
    walletAddress: address,
    poolAddress,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    slippagePct,
  });

  // Transform to API response format
  if (result.status === 1 && result.data) {
    const baseTokenBalanceChange = side === 'SELL' ? -result.data.amountIn : result.data.amountOut;
    const quoteTokenBalanceChange = side === 'SELL' ? result.data.amountOut : -result.data.amountIn;

    logger.info(
      `Swap executed successfully: ${result.data.amountIn.toFixed(4)} -> ${result.data.amountOut.toFixed(4)}`,
    );

    return {
      signature: result.signature,
      status: result.status,
      data: {
        tokenIn: result.data.tokenIn,
        tokenOut: result.data.tokenOut,
        amountIn: result.data.amountIn,
        amountOut: result.data.amountOut,
        fee: result.data.fee,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
      },
    };
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
      } catch (e: any) {
        logger.error('Error executing swap:', e.message || e);
        logger.error('Full error:', JSON.stringify(e, null, 2));

        if (e.statusCode) {
          // If it's already an HTTP error, throw it properly
          throw e;
        }

        // Check for specific error messages
        const errorMessage = e.message || e.toString();
        if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
          throw fastify.httpErrors.serviceUnavailable('RPC service temporarily unavailable. Please try again.');
        }

        throw fastify.httpErrors.internalServerError(`Swap execution failed: ${errorMessage}`);
      }
    },
  );
};

export default executeSwapRoute;

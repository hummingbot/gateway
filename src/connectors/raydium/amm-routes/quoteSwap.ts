import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  QuoteSwapResponseType,
  QuoteSwapResponse,
  QuoteSwapRequestType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumAmmQuoteSwapRequest } from '../schemas';
import { quoteSwap as sdkQuoteSwap } from '../../../../packages/sdk/src/solana/raydium/operations/amm/quote-swap';


export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Raydium AMM',
        tags: ['/connector/raydium'],
        querystring: RaydiumAmmQuoteSwapRequest,
        response: {
          200: QuoteSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

        const raydium = await Raydium.getInstance(network);
        const solana = await Solana.getInstance(network);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
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
            'raydium',
            network,
            'amm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Raydium`,
            );
          }

          poolAddressToUse = pool.address;
        }

        // Convert side/amount to tokenIn/tokenOut/amountIn/amountOut
        const isSell = side === 'SELL';
        const tokenIn = isSell ? baseToken : quoteToken;
        const tokenOut = isSell ? quoteToken : baseToken;
        const amountIn = isSell ? amount : undefined;
        const amountOut = isSell ? undefined : amount;

        // Call SDK operation
        const result = await sdkQuoteSwap(raydium, solana, {
          network,
          poolAddress: poolAddressToUse,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          slippagePct,
        });

        return result;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        if (e.message?.includes('Pool not found')) {
          throw fastify.httpErrors.notFound(e.message);
        }
        if (e.message?.includes('Token not found')) {
          throw fastify.httpErrors.badRequest(e.message);
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

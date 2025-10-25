import { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { quoteLiquidity as sdkQuoteLiquidity } from '../../../../packages/sdk/src/solana/raydium/operations/amm/quote-liquidity';
import { Solana } from '../../../chains/solana/solana';
import {
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumAmmQuoteLiquidityRequest } from '../schemas';

/**
 * Helper function for quoting liquidity (used by addLiquidity)
 */
export async function quoteLiquidity(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<QuoteLiquidityResponseType> {
  const raydium = await Raydium.getInstance(network);
  const solana = await Solana.getInstance(network);

  // Call SDK operation
  const result = await sdkQuoteLiquidity(raydium, solana, {
    network,
    poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  });

  return result;
}

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType | { error: string };
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Quote amounts for a new Raydium AMM liquidity position',
        tags: ['/connector/raydium'],
        querystring: RaydiumAmmQuoteLiquidityRequest,
        response: {
          200: QuoteLiquidityResponse,
          500: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.query;

        // Use the helper function
        return await quoteLiquidity(fastify, network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quoteLiquidityRoute;

/**
 * Add Liquidity Route - SDK Version
 *
 * This is the new implementation that uses the SDK.
 * The old implementation (addLiquidity.ts) contained 286 lines of business logic.
 * This new implementation is a thin wrapper (~50 lines) that calls the SDK.
 *
 * This demonstrates the dual SDK/API pattern:
 * - SDK Mode: Direct usage via RaydiumConnector
 * - API Mode: HTTP endpoint that calls SDK internally
 */

import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import {
  AddLiquidityResponse,
  AddLiquidityResponseType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { RaydiumAmmAddLiquidityRequest } from '../schemas';

// Import SDK
import { RaydiumConnector } from '../../../../../packages/sdk/src/solana/raydium';

/**
 * Add Liquidity using SDK
 *
 * Thin wrapper that:
 * 1. Gets SDK instance
 * 2. Calls SDK operation
 * 3. Returns result
 *
 * Business logic is in the SDK, not here.
 */
async function addLiquidityViaSdk(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
): Promise<AddLiquidityResponseType> {
  // Get SDK instance
  const raydium = await RaydiumConnector.getInstance(network);

  // Call SDK operation
  const result = await raydium.operations.addLiquidity.execute({
    poolAddress,
    walletAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  });

  return result;
}

/**
 * Fastify route handler
 */
export const addLiquidityRouteSdk: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof RaydiumAmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity-sdk',
    {
      schema: {
        description: 'Add liquidity to a Raydium AMM/CPMM pool (SDK version)',
        tags: ['/connector/raydium'],
        body: RaydiumAmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        return await addLiquidityViaSdk(
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message);
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRouteSdk;

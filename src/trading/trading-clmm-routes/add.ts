import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { AddLiquidityResponseType, AddLiquidityResponse } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

// Unified schema with connector field
const UnifiedAddLiquidityRequest = Type.Object({
  connector: Type.String({ description: 'Connector name' }),
  network: Type.String({ description: 'Network name' }),
  walletAddress: Type.String({ description: 'Wallet address' }),
  positionAddress: Type.String({ description: 'Position address' }),
  baseTokenAmount: Type.Number({ description: 'Base token amount' }),
  quoteTokenAmount: Type.Number({ description: 'Quote token amount' }),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

// Import connector functions
import { addLiquidity as uniswapAddLiquidity } from '../../connectors/uniswap/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapAddLiquidity } from '../../connectors/pancakeswap/clmm-routes/addLiquidity';
import { addLiquidity as raydiumAddLiquidity } from '../../connectors/raydium/clmm-routes/addLiquidity';
import { addLiquidity as meteoraAddLiquidity } from '../../connectors/meteora/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapSolAddLiquidity } from '../../connectors/pancakeswap-sol/clmm-routes/addLiquidity';

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add',
    {
      schema: {
        description: 'Add liquidity to an existing CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { connector, network, walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapAddLiquidity(
              fastify,
              network,
              walletAddress,
              positionAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'pancakeswap':
            return await pancakeswapAddLiquidity(
              fastify,
              network,
              walletAddress,
              positionAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'raydium':
            return await raydiumAddLiquidity(
              fastify,
              network,
              walletAddress,
              positionAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'meteora':
            return await meteoraAddLiquidity(
              fastify,
              network,
              walletAddress,
              positionAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'pancakeswap-sol':
            return await pancakeswapSolAddLiquidity(
              fastify,
              network,
              walletAddress,
              positionAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          default:
            throw fastify.httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to add liquidity:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

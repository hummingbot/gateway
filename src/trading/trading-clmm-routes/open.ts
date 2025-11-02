import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { Solana } from '../../chains/solana/solana';

// Unified schema with connector field
const UnifiedOpenPositionRequest = Type.Object({
  connector: Type.String({ description: 'Connector name (uniswap, pancakeswap, raydium, meteora, pancakeswap-sol)' }),
  network: Type.String({ description: 'Network name' }),
  walletAddress: Type.String({ description: 'Wallet address' }),
  lowerPrice: Type.Number(),
  upperPrice: Type.Number(),
  poolAddress: Type.String(),
  baseTokenAmount: Type.Optional(Type.Number()),
  quoteTokenAmount: Type.Optional(Type.Number()),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

// Import connector functions
import { openPosition as meteoraOpenPosition } from '../../connectors/meteora/clmm-routes/openPosition';
import { openPosition as pancakeswapOpenPosition } from '../../connectors/pancakeswap/clmm-routes/openPosition';
import { openPosition as pancakeswapSolOpenPosition } from '../../connectors/pancakeswap-sol/clmm-routes/openPosition';
import { openPosition as raydiumOpenPosition } from '../../connectors/raydium/clmm-routes/openPosition';
import { openPosition as uniswapOpenPosition } from '../../connectors/uniswap/clmm-routes/openPosition';
import { OpenPositionResponseType, OpenPositionResponse } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open',
    {
      schema: {
        description: 'Open a new CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          network,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapOpenPosition(
              fastify,
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'pancakeswap':
            return await pancakeswapOpenPosition(
              fastify,
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'raydium':
            return await raydiumOpenPosition(
              fastify,
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'meteora':
            return await meteoraOpenPosition(
              fastify,
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'pancakeswap-sol':
            return await pancakeswapSolOpenPosition(
              fastify,
              network,
              walletAddress,
              poolAddress,
              lowerPrice,
              upperPrice,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          default:
            throw fastify.httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to open position:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to open position');
      }
    },
  );
};

export default openPositionRoute;

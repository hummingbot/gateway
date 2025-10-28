import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ClosePositionResponseType, ClosePositionResponse } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

// Unified schema with connector field
const UnifiedClosePositionRequest = Type.Object({
  connector: Type.String({ description: 'Connector name' }),
  network: Type.String({ description: 'Network name' }),
  walletAddress: Type.String({ description: 'Wallet address' }),
  positionAddress: Type.String({ description: 'Position address' }),
});

// Import connector functions
import { closePosition as uniswapClosePosition } from '../../connectors/uniswap/clmm-routes/closePosition';
import { closePosition as pancakeswapClosePosition } from '../../connectors/pancakeswap/clmm-routes/closePosition';
import { closePosition as raydiumClosePosition } from '../../connectors/raydium/clmm-routes/closePosition';
import { closePosition as meteoraClosePosition } from '../../connectors/meteora/clmm-routes/closePosition';
import { closePosition as pancakeswapSolClosePosition } from '../../connectors/pancakeswap-sol/clmm-routes/closePosition';

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close',
    {
      schema: {
        description: 'Close a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { connector, network, walletAddress, positionAddress } = request.body;

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapClosePosition(fastify, network, walletAddress, positionAddress);

          case 'pancakeswap':
            return await pancakeswapClosePosition(fastify, network, walletAddress, positionAddress);

          case 'raydium':
            return await raydiumClosePosition(fastify, network, walletAddress, positionAddress);

          case 'meteora':
            return await meteoraClosePosition(fastify, network, walletAddress, positionAddress);

          case 'pancakeswap-sol':
            return await pancakeswapSolClosePosition(fastify, network, walletAddress, positionAddress);

          default:
            throw fastify.httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to close position:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to close position');
      }
    },
  );
};

export default closePositionRoute;

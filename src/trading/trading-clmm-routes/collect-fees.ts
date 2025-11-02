import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { CollectFeesResponseType, CollectFeesResponse } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

// Unified schema with connector field
const UnifiedCollectFeesRequest = Type.Object({
  connector: Type.String({ description: 'Connector name' }),
  network: Type.String({ description: 'Network name' }),
  walletAddress: Type.String({ description: 'Wallet address' }),
  positionAddress: Type.String({ description: 'Position address' }),
});

// Import connector functions
import { collectFees as uniswapCollectFees } from '../../connectors/uniswap/clmm-routes/collectFees';
import { collectFees as pancakeswapCollectFees } from '../../connectors/pancakeswap/clmm-routes/collectFees';
import { collectFees as raydiumCollectFees } from '../../connectors/raydium/clmm-routes/collectFees';
import { collectFees as meteoraCollectFees } from '../../connectors/meteora/clmm-routes/collectFees';
import { collectFees as pancakeswapSolCollectFees } from '../../connectors/pancakeswap-sol/clmm-routes/collectFees';

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { connector, network, walletAddress, positionAddress } = request.body;

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapCollectFees(fastify, network, walletAddress, positionAddress);

          case 'pancakeswap':
            return await pancakeswapCollectFees(fastify, network, walletAddress, positionAddress);

          case 'raydium':
            return await raydiumCollectFees(fastify, network, walletAddress, positionAddress);

          case 'meteora':
            return await meteoraCollectFees(fastify, network, walletAddress, positionAddress);

          case 'pancakeswap-sol':
            return await pancakeswapSolCollectFees(fastify, network, walletAddress, positionAddress);

          default:
            throw fastify.httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to collect fees:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  CollectFeesRequestType as CLMMCollectFeesRequestType,
  CollectFeesResponseType as CLMMCollectFeesResponseType,
  CollectFeesRequest as CLMMCollectFeesRequest,
  CollectFeesResponse as CLMMCollectFeesResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function collectFees(
  fastify: FastifyInstance,
  request: CLMMCollectFeesRequestType,
): Promise<CLMMCollectFeesResponseType> {
  let networkToUse = request.network ? request.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
  const response = await osmosis.controller.collectFees(osmosis, fastify, request);
  return response;
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.post<{
    Body: CLMMCollectFeesRequestType;
    Reply: CLMMCollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from an Osmosis CL position',
        tags: ['osmosis/connector'],
        body: {
          ...CLMMCollectFeesRequest,
          properties: {
            ...CLMMCollectFeesRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: {
              type: 'string',
              description: 'Position address',
              examples: ['1234'],
            },
          },
        },
        response: {
          200: CLMMCollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        // Validate essential parameters
        const { positionAddress } = request.body;
        if (!positionAddress) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        return (await collectFees(fastify, request.body)) as CLMMCollectFeesResponseType;
      } catch (e) {
        logger.error(`Error in pool-info route: ${e.message}`);
        if (e.stack) {
          logger.debug(`Stack trace: ${e.stack}`);
        }

        // Return appropriate error based on the error message
        if (e.statusCode) {
          throw e; // Already a formatted Fastify error
        } else if (e.message && e.message.includes('invalid address')) {
          throw fastify.httpErrors.badRequest(`Invalid pool address`);
        } else if (e.message && e.message.includes('not found')) {
          throw fastify.httpErrors.notFound(e.message);
        } else {
          throw fastify.httpErrors.internalServerError(`Failed to fetch pool info: ${e.message}`);
        }
      }
    },
  );
};

export default collectFeesRoute;

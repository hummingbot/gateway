import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  ClosePositionRequest as CLMMClosePositionRequest,
  ClosePositionRequestType as CLMMClosePositionRequestType,
  ClosePositionResponse as CLMMClosePositionResponse,
  ClosePositionResponseType as CLMMClosePositionResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function closePosition(
  fastify: FastifyInstance,
  request: CLMMClosePositionRequestType,
): Promise<CLMMClosePositionResponseType> {
  let networkToUse = request.network ? request.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
  const response = await osmosis.controller.closePositionCLMM(osmosis, fastify, request);
  return response;
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: CLMMClosePositionRequestType;
    Reply: CLMMClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close an Osmosis CL position by removing all liquidity and collecting fees',
        tags: ['osmosis/connector'],
        body: {
          ...CLMMClosePositionRequest,
          properties: {
            ...CLMMClosePositionRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
            },
          },
        },
        response: {
          200: CLMMClosePositionResponse,
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

        return (await closePosition(fastify, request.body)) as CLMMClosePositionResponseType;
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

export default closePositionRoute;

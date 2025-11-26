import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  OpenPositionRequest as CLMMOpenPositionRequest,
  OpenPositionRequestType as CLMMOpenPositionRequestType,
  OpenPositionResponse as CLMMOpenPositionResponse,
  OpenPositionResponseType as CLMMOpenPositionResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function openPosition(
  fastify: FastifyInstance,
  request: CLMMOpenPositionRequestType,
): Promise<CLMMOpenPositionResponseType> {
  let networkToUse = request.network ? request.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
  const response = await osmosis.controller.openPositionCLMM(osmosis, fastify, request);
  return response;
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.post<{
    Body: CLMMOpenPositionRequestType;
    Reply: CLMMOpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new liquidity position in an Osmosis CL Pool',
        tags: ['osmosis/connector'],
        body: {
          ...CLMMOpenPositionRequest,
          properties: {
            ...CLMMOpenPositionRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            lowerPrice: { type: 'number', examples: [1000] },
            upperPrice: { type: 'number', examples: [4000] },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['ION'] },
            quoteToken: { type: 'string', examples: ['OSMO'] },
            baseTokenAmount: { type: 'number', examples: [0.001] },
            quoteTokenAmount: { type: 'number', examples: [3] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: CLMMOpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { lowerPrice, upperPrice, baseTokenAmount, quoteTokenAmount } = request.body;
        // Validate essential parameters
        if (!lowerPrice || !upperPrice || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        return (await openPosition(fastify, request.body)) as CLMMOpenPositionResponseType;
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

export default openPositionRoute;

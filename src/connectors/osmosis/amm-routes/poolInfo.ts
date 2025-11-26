import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  GetPoolInfoRequest,
  PoolInfoSchema,
  PoolInfo as AMMPoolInfo,
  GetPoolInfoRequestType as AMMGetPoolInfoRequestType,
} from '../../../schemas/amm-schema';
import {
  PoolInfo as CLMMPoolInfo,
  GetPoolInfoRequestType as CLMMGetPoolInfoRequestType,
} from '../../../schemas/clmm-schema';
import { ConfigManagerV2 } from '../../../services/config-manager-v2';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';
const osmosisNetworks = ['testnet', 'mainnet'];

export async function poolInfo(
  fastify: FastifyInstance,
  request: AMMGetPoolInfoRequestType | CLMMGetPoolInfoRequestType,
  poolType: string,
): Promise<AMMPoolInfo> {
  let networkToUse = request.network ? request.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
  const response = (await osmosis.controller.poolInfoRequest(osmosis, fastify, request, poolType)) as AMMPoolInfo;
  return response;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: AMMGetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Osmosis',
        tags: ['osmosis/connector/amm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: {
              type: 'string',
              default: 'mainnet',
              enum: ['testnet', 'mainnet'], //osmosisNetworks
            },
            poolAddress: {
              type: 'string',
              examples: ['osmo1500hy75krs9e8t50aav6fahk8sxhajn9ctp40qwvvn8tcprkk6wszun4a5'],
            },
          },
        },
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<AMMPoolInfo> => {
      try {
        const { poolAddress } = request.query;

        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('Pool address must be provided');
        }

        return (await poolInfo(fastify, request.query, 'amm')) as AMMPoolInfo;
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

export default poolInfoRoute;

import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { ConfigQuery, ConfigQuerySchema } from '../schemas';
import { getConfig } from '../utils';

export const getConfigRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ConfigQuery }>(
    '/',
    {
      schema: {
        description:
          'Get configuration settings. Returns all configurations if no parameters are specified. Use namespace to get a specific config (e.g., server, ethereum-mainnet, solana-mainnet-beta, uniswap).',
        tags: ['/config'],
        querystring: ConfigQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request) => {
      try {
        const { namespace } = request.query;
        return getConfig(fastify, namespace);
      } catch (error) {
        logger.error(`Config retrieval failed: ${error.message}`);
        // Re-throw the error if it's already a Fastify HTTP error
        if (error.statusCode) {
          throw error;
        }
        // Otherwise, throw a generic internal server error
        throw fastify.httpErrors.internalServerError('Failed to retrieve configuration');
      }
    },
  );
};

export default getConfigRoute;

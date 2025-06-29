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
          "Get configuration settings. Returns all configurations if no parameters are specified. Use namespace to get a specific config (e.g., server, ethereum, solana, uniswap). Use network parameter with a chain namespace to get only that network's configuration.",
        tags: ['system'],
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
        const { namespace, network } = request.query;
        return getConfig(fastify, namespace, network);
      } catch (error) {
        logger.error(`Config retrieval failed: ${error.message}`);
        // Re-throw the error if it's already a Fastify HTTP error
        if (error.statusCode) {
          throw error;
        }
        // Otherwise, throw a generic internal server error
        throw fastify.httpErrors.internalServerError(
          'Failed to retrieve configuration',
        );
      }
    },
  );
};

export default getConfigRoute;

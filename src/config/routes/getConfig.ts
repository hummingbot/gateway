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
          'Get configuration settings. Returns all configurations if no chain/connector is specified.',
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
      const { chainOrConnector } = request.query;
      return getConfig(fastify, chainOrConnector);
    },
  );
};

export default getConfigRoute;

import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../services/logger';
import { getConfig } from '../utils';
import { ConfigQuery, ConfigQuerySchema } from '../schemas';

export const getConfigRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ConfigQuery }>(
    '/',
    {
      schema: {
        description: 'Get configuration settings. Returns all configurations if no chain/connector is specified.',
        tags: ['config'],
        querystring: ConfigQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: true
          }
        }
      }
    },
    async (request) => {
      const { chainOrConnector } = request.query;
      return getConfig(fastify, chainOrConnector);
    }
  );
};

export default getConfigRoute;
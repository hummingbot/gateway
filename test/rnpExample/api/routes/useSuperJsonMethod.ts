import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const useSuperJsonMethodRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { b: string };
  }>(
    '/useSuperJsonMethod',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useSuperJsonMethod();
      } catch (error) {
        logger.error(
          `Error getting useSuperJsonMethod status: ${error.message}`,
        );
        throw fastify.httpErrors.internalServerError(
          `Failed to useSuperJsonMethod: ${error.message}`,
        );
      }
    },
  );
};

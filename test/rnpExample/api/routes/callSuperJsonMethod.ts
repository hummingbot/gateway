import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const callSuperJsonMethodRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { b: string };
  }>(
    '/callSuperJsonMethod',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.callSuperJsonMethod();
      } catch (error) {
        logger.error(
          `Error getting callSuperJsonMethod status: ${error.message}`,
        );
        throw fastify.httpErrors.internalServerError(
          `Failed to callSuperJsonMethod: ${error.message}`,
        );
      }
    },
  );
};

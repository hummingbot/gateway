import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const useUnlistedDepRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { z: string };
  }>(
    '/useUnlistedDep',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useUnlistedDep();
      } catch (error) {
        logger.error(`Error getting useUnlistedDep status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to useUnlistedDep: ${error.message}`,
        );
      }
    },
  );
};

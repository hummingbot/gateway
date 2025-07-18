import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const callUnlistedDepRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { z: string };
  }>(
    '/callUnlistedDep',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.callUnlistedDep();
      } catch (error) {
        logger.error(`Error getting callUnlistedDep status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to callUnlistedDep: ${error.message}`,
        );
      }
    },
  );
};

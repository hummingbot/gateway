import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const usePrototypeDepRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { x: string };
  }>(
    '/usePrototypeDep',
    {
      schema: {
        summary: 'A RnpExample route for testing prototype dependencies',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.usePrototypeDep();
      } catch (error) {
        logger.error(`Error getting usePrototypeDep status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to usePrototypeDep: ${error.message}`,
        );
      }
    },
  );
};

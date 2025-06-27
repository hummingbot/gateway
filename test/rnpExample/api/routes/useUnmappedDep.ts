import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const useUnmappedDepRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { z: string };
  }>(
    '/useUnmappedDep',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useUnmappedDep();
      } catch (error) {
        logger.error(`Error getting useUnmappedDep status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to useUnmappedDep: ${error.message}`,
        );
      }
    },
  );
};

import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const useUnmappedMethodRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { unmapped: string };
  }>(
    '/useUnmappedMethod',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useUnmappedMethod();
      } catch (error) {
        logger.error(
          `Error getting useUnmappedMethod status: ${error.message}`,
        );
        // Throw specific error to verify a 424 is returned for snapshot
        throw fastify.httpErrors.failedDependency(
          `Failed to useUnmappedMethod: ${error.message}`,
        );
      }
    },
  );
};

import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const callUnmappedMethodRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { unmapped: string };
  }>(
    '/callUnmappedMethod',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.callUnmappedMethod();
      } catch (error) {
        logger.error(`Error getting callUnmappedMethod status: ${error.message}`);
        // Throw specific error to verify a 501 is returned for snapshot
        throw fastify.httpErrors.notImplemented(`Failed to callUnmappedMethod: ${error.message}`);
      }
    },
  );
};

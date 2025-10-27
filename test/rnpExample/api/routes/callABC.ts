import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const callABCRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { a: string; b: string; c: string };
  }>(
    '/callABC',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.callABC();
      } catch (error) {
        logger.error(`Error getting callABC status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to callABC: ${error.message}`);
      }
    },
  );
};

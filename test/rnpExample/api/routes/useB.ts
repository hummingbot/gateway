import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const useBRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { b: string };
  }>(
    '/useB',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useB();
      } catch (error) {
        logger.error(`Error getting useB status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to useB: ${error.message}`,
        );
      }
    },
  );
};

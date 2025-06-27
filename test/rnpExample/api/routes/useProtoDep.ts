import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const useProtoDepRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { x: string };
  }>(
    '/useProtoDep',
    {
      schema: {
        summary: 'A RnpExample route for testing prototype dependencies',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useProtoDep();
      } catch (error) {
        logger.error(`Error getting useProtoDep status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to useProtoDep: ${error.message}`,
        );
      }
    },
  );
};

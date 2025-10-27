import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const callDTwiceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { d1: string; d2: string };
  }>(
    '/callDTwice',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.callDTwice();
      } catch (error) {
        logger.error(`Error getting callDTwice status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to callDTwice: ${error.message}`);
      }
    },
  );
};

import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from '../rnpExample';

export const callPrototypeDepRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { x: string };
  }>(
    '/callPrototypeDep',
    {
      schema: {
        summary: 'A RnpExample route for testing prototype dependencies',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.callPrototypeDep();
      } catch (error) {
        logger.error(`Error getting callPrototypeDep status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to callPrototypeDep: ${error.message}`);
      }
    },
  );
};

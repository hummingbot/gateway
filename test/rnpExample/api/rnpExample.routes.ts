import { FastifyPluginAsync } from 'fastify';

import { logger } from '#src/services/logger';

import { RnpExample } from './rnpExample';

const useABCRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { a: string; b: string; c: string };
  }>(
    '/useABC',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useABC();
      } catch (error) {
        logger.error(`Error getting useABC status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to useABC: ${error.message}`,
        );
      }
    },
  );
};

const useDTwiceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network: string };
    Reply: { d1: string; d2: string };
  }>(
    '/useDTwice',
    {
      schema: {
        summary: 'A RnpExample route for testing',
      },
    },
    async (request) => {
      try {
        const rnpExample = await RnpExample.getInstance(request.query.network);
        return await rnpExample.useDTwice();
      } catch (error) {
        logger.error(`Error getting useDTwice status: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Failed to useDTwice: ${error.message}`,
        );
      }
    },
  );
};

const useUnmappedDepRoute: FastifyPluginAsync = async (fastify) => {
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

export const rnpExampleRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(useABCRoute);
  await fastify.register(useDTwiceRoute);
  await fastify.register(useUnmappedDepRoute);
};

export default rnpExampleRoutes;

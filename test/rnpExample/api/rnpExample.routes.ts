import { FastifyPluginAsync } from 'fastify';

import { useABCRoute } from './routes/useABC';
import { useDTwiceRoute } from './routes/useDTwice';
import { useUnmappedDepRoute } from './routes/useUnmappedDep';
import { useUnmappedMethodRoute } from './routes/useUnmappedMethod';

export const rnpExampleRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(useABCRoute);
  await fastify.register(useDTwiceRoute);
  await fastify.register(useUnmappedMethodRoute);
  await fastify.register(useUnmappedDepRoute);
};

export default rnpExampleRoutes;

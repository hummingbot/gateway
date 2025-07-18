import { FastifyPluginAsync } from 'fastify';

import { useABCRoute } from './routes/useABC';
import { useDTwiceRoute } from './routes/useDTwice';
import { usePrototypeDepRoute } from './routes/usePrototypeDep';
import { useSuperJsonMethodRoute } from './routes/useSuperJsonMethod';
import { useUnlistedDepRoute } from './routes/useUnlistedDep';
import { useUnmappedMethodRoute } from './routes/useUnmappedMethod';

export const rnpExampleRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(useABCRoute);
  await fastify.register(useSuperJsonMethodRoute);
  await fastify.register(useDTwiceRoute);
  await fastify.register(usePrototypeDepRoute);
  await fastify.register(useUnlistedDepRoute);
  await fastify.register(useUnmappedMethodRoute);
};

export default rnpExampleRoutes;

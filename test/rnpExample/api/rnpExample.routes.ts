import { FastifyPluginAsync } from 'fastify';

import { useABCRoute } from './routes/useABC';
import { useBRoute } from './routes/useB';
import { useDTwiceRoute } from './routes/useDTwice';
import { useProtoDepRoute } from './routes/useProtoDep';
import { useUnlistedDepRoute } from './routes/useUnlistedDep';
import { useUnmappedMethodRoute } from './routes/useUnmappedMethod';

export const rnpExampleRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(useABCRoute);
  await fastify.register(useBRoute);
  await fastify.register(useDTwiceRoute);
  await fastify.register(useProtoDepRoute);
  await fastify.register(useUnlistedDepRoute);
  await fastify.register(useUnmappedMethodRoute);
};

export default rnpExampleRoutes;

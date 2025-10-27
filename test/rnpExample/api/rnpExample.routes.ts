import { FastifyPluginAsync } from 'fastify';

import { callABCRoute } from './routes/callABC';
import { callDTwiceRoute } from './routes/callDTwice';
import { callPrototypeDepRoute } from './routes/callPrototypeDep';
import { callSuperJsonMethodRoute } from './routes/callSuperJsonMethod';
import { callUnlistedDepRoute } from './routes/callUnlistedDep';
import { callUnmappedMethodRoute } from './routes/callUnmappedMethod';

export const rnpExampleRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(callABCRoute);
  await fastify.register(callSuperJsonMethodRoute);
  await fastify.register(callDTwiceRoute);
  await fastify.register(callPrototypeDepRoute);
  await fastify.register(callUnlistedDepRoute);
  await fastify.register(callUnmappedMethodRoute);
};

export default rnpExampleRoutes;

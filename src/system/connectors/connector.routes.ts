import { FastifyPluginAsync } from 'fastify';
import { getConnectorsRoute } from './routes/getConnectors';

export const connectorsRoutes: FastifyPluginAsync = async (fastify) => {
  // Register individual route handlers
  await fastify.register(getConnectorsRoute);
};

export default connectorsRoutes;
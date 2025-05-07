import { FastifyPluginAsync } from 'fastify';
import { getAvailableConnectors } from './utils';
import { ConnectorsResponse, ConnectorsResponseSchema } from './schemas';

export const connectorsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: ConnectorsResponse }>(
    '/',
    {
      schema: {
        description: 'Returns a list of available DEX connectors and their supported blockchain networks.',
        tags: ['connectors'],
        response: {
          200: ConnectorsResponseSchema
        }
      }
    },
    async () => {
      const connectors = getAvailableConnectors();
      return { connectors };
    }
  );
};

export default connectorsRoutes;
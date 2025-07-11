import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ConfigManagerV2 } from '../services/config-manager-v2';
import { logger } from '../services/logger';

// Define the schema using Typebox
const NamespacesResponseSchema = Type.Object({
  namespaces: Type.Array(Type.String()),
});

// Type for TypeScript
type NamespacesResponse = Static<typeof NamespacesResponseSchema>;

export const namespaceRoutes: FastifyPluginAsync = async (fastify) => {
  // List all namespaces
  fastify.get<{ Reply: NamespacesResponse }>(
    '/',
    {
      schema: {
        description: 'Returns a list of all configuration namespaces available in Gateway.',
        tags: ['system'],
        response: {
          200: NamespacesResponseSchema,
        },
      },
    },
    async () => {
      logger.info('Getting all configuration namespaces');

      const configManager = ConfigManagerV2.getInstance();
      const namespaces = Object.keys(configManager.namespaces).sort();

      logger.info(`Found ${namespaces.length} namespaces: ${namespaces.join(', ')}`);

      return { namespaces };
    },
  );
};

export default namespaceRoutes;

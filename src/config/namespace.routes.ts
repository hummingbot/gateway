import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ConfigManagerV2 } from '../services/config-manager-v2';
import { logger } from '../services/logger';

// Define the schema using Typebox
const NamespaceSchema = Type.Object({
  id: Type.String(),
  type: Type.String(),
});

const NamespacesResponseSchema = Type.Object({
  namespaces: Type.Array(NamespaceSchema),
});

// Type for TypeScript
type NamespacesResponse = Static<typeof NamespacesResponseSchema>;

export const namespaceRoutes: FastifyPluginAsync = async (fastify) => {
  // List all namespaces
  fastify.get<{ Reply: NamespacesResponse }>(
    '/',
    {
      schema: {
        description:
          'Returns a list of all configuration namespaces available in Gateway.',
        tags: ['system'],
        response: {
          200: NamespacesResponseSchema,
        },
      },
    },
    async () => {
      logger.info('Getting all configuration namespaces');

      const configManager = ConfigManagerV2.getInstance();
      const allNamespaceIds = Object.keys(configManager.namespaces);
      
      // Map namespace IDs to namespace objects with type information
      const namespaces = allNamespaceIds.map(id => {
        let type = 'other';
        
        // Determine namespace type
        if (id === 'server') {
          type = 'server';
        } else if (id.includes('-')) {
          // Network namespaces like ethereum-mainnet, solana-mainnet-beta
          const [chain] = id.split('-');
          if (['ethereum', 'solana'].includes(chain)) {
            type = 'network';
          }
        } else if (['uniswap', 'jupiter', 'meteora', 'raydium'].includes(id)) {
          type = 'connector';
        }
        
        return {
          id,
          type,
        };
      });

      // Sort namespaces by type and then by id
      namespaces.sort((a, b) => {
        if (a.type !== b.type) {
          const typeOrder = ['server', 'network', 'connector', 'other'];
          return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
        }
        return a.id.localeCompare(b.id);
      });

      logger.info(
        `Found ${namespaces.length} namespaces: ${namespaces.map(n => n.id).join(', ')}`
      );

      return { namespaces };
    },
  );
};

export default namespaceRoutes;
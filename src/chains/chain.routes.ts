import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ConfigManagerV2 } from '../services/config-manager-v2';
import { logger } from '../services/logger';

// Define the schema using Typebox
const NetworkSchema = Type.Object({
  chain: Type.String(),
  networks: Type.Array(Type.String()),
});

const ChainsResponseSchema = Type.Object({
  chains: Type.Array(NetworkSchema),
});

// Type for TypeScript
type ChainsResponse = Static<typeof ChainsResponseSchema>;

export const chainRoutes: FastifyPluginAsync = async (fastify) => {
  // List available chains
  fastify.get<{ Reply: ChainsResponse }>(
    '/',
    {
      schema: {
        description:
          'Returns a list of available blockchain networks supported by Gateway.',
        tags: ['system'],
        response: {
          200: ChainsResponseSchema,
        },
      },
    },
    async () => {
      logger.info('Getting available blockchain networks');

      // With the new namespace structure, we need to look for namespaces
      // that match the pattern {chain}-{network}
      const configManager = ConfigManagerV2.getInstance();
      const allNamespaces = Object.keys(configManager.namespaces);

      // Group networks by chain
      const chainNetworks: { [chain: string]: string[] } = {};

      allNamespaces.forEach((namespace) => {
        // Skip non-network namespaces
        if (!namespace.includes('-')) return;

        const [chain, ...networkParts] = namespace.split('-');
        const network = networkParts.join('-'); // Handle networks like mainnet-beta

        // Only process known chains
        if (['ethereum', 'solana'].includes(chain)) {
          if (!chainNetworks[chain]) {
            chainNetworks[chain] = [];
          }
          chainNetworks[chain].push(network);
        }
      });

      // Ensure we have both chains even if no networks are loaded
      if (!chainNetworks['ethereum']) {
        chainNetworks['ethereum'] = [];
      }
      if (!chainNetworks['solana']) {
        chainNetworks['solana'] = [];
      }

      const chains = Object.entries(chainNetworks).map(([chain, networks]) => ({
        chain,
        networks: networks.sort(),
      }));

      logger.info(
        'Available chains: ' +
          chains
            .map((c) => `${c.chain} (${c.networks.length} networks)`)
            .join(', '),
      );

      return { chains };
    },
  );
};

export default chainRoutes;

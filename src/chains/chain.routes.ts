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

      // Get Ethereum networks
      const ethereumNetworks = Object.keys(
        ConfigManagerV2.getInstance().get('ethereum.networks') || {},
      );

      // Get Solana networks
      const solanaNetworks = Object.keys(
        ConfigManagerV2.getInstance().get('solana.networks') || {},
      );

      const chains = [
        {
          chain: 'ethereum',
          networks: ethereumNetworks,
        },
        {
          chain: 'solana',
          networks: solanaNetworks,
        },
      ];

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

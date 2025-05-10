import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../services/logger';

import { JupiterConfig } from './jupiter/jupiter.config';
import { MeteoraConfig } from './meteora/meteora.config';
import { RaydiumConfig } from './raydium/raydium.config';
import { UniswapConfig } from './uniswap/uniswap.config';

// Define the schema using Typebox
const NetworkSchema = Type.Object({
  chain: Type.String(),
  networks: Type.Array(Type.String()),
});

const ConnectorSchema = Type.Object({
  name: Type.String(),
  trading_types: Type.Array(Type.String()),
  available_networks: Type.Array(NetworkSchema),
});

const ConnectorsResponseSchema = Type.Object({
  connectors: Type.Array(ConnectorSchema),
});

// Type for TypeScript
type ConnectorsResponse = Static<typeof ConnectorsResponseSchema>;

export const connectorsRoutes: FastifyPluginAsync = async (fastify) => {
  // List available connectors
  fastify.get<{ Reply: ConnectorsResponse }>(
    '/',
    {
      schema: {
        description:
          'Returns a list of available DEX connectors and their supported blockchain networks.',
        tags: ['system'],
        response: {
          200: ConnectorsResponseSchema,
        },
      },
    },
    async () => {
      logger.info('Getting available DEX connectors and networks');

      const connectors = [
        {
          name: 'jupiter',
          trading_types: ['swap'],
          available_networks: JupiterConfig.config.availableNetworks,
        },
        {
          name: 'meteora/clmm',
          trading_types: ['clmm', 'swap'],
          available_networks: MeteoraConfig.config.availableNetworks,
        },
        {
          name: 'raydium/amm',
          trading_types: ['amm', 'swap'],
          available_networks: RaydiumConfig.config.availableNetworks,
        },
        {
          name: 'raydium/clmm',
          trading_types: ['clmm', 'swap'],
          available_networks: RaydiumConfig.config.availableNetworks,
        },
        {
          name: 'uniswap',
          trading_types: ['swap'],
          available_networks: UniswapConfig.config.availableNetworks,
        },
        {
          name: 'uniswap/amm',
          trading_types: ['amm', 'swap'],
          available_networks: UniswapConfig.config.availableNetworks,
        },
        {
          name: 'uniswap/clmm',
          trading_types: ['clmm', 'swap'],
          available_networks: UniswapConfig.config.availableNetworks,
        },
      ];

      logger.info(
        'Available connectors: ' + connectors.map((c) => c.name).join(', '),
      );

      return { connectors };
    },
  );
};

export default connectorsRoutes;

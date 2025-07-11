import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../services/logger';

import { ZeroXConfig } from './0x/0x.config';
import { JupiterConfig } from './jupiter/jupiter.config';
import { MeteoraConfig } from './meteora/meteora.config';
import { RaydiumConfig } from './raydium/raydium.config';
import { UniswapConfig } from './uniswap/uniswap.config';

// Define the schema using Typebox
const ConnectorSchema = Type.Object({
  name: Type.String(),
  trading_types: Type.Array(Type.String()),
  chain: Type.String(),
  networks: Type.Array(Type.String()),
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
        description: 'Returns a list of available DEX connectors and their supported blockchain networks.',
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
          trading_types: ['router'],
          chain: JupiterConfig.chain,
          networks: JupiterConfig.networks,
        },
        {
          name: 'meteora',
          trading_types: ['clmm'],
          chain: MeteoraConfig.chain,
          networks: MeteoraConfig.networks,
        },
        {
          name: 'raydium',
          trading_types: ['amm', 'clmm'],
          chain: RaydiumConfig.chain,
          networks: RaydiumConfig.networks,
        },
        {
          name: 'uniswap',
          trading_types: ['amm', 'clmm', 'router'],
          chain: 'ethereum',
          networks: UniswapConfig.networks,
        },
        {
          name: '0x',
          trading_types: ['router'],
          chain: 'ethereum',
          networks: ZeroXConfig.networks.mainnet.availableNetworks,
        },
      ];

      logger.info('Available connectors: ' + connectors.map((c) => c.name).join(', '));

      return { connectors };
    },
  );
};

export default connectorsRoutes;

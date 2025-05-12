import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../services/logger';

import { JupiterConfig } from './jupiter/jupiter.config';
import { MeteoraConfig } from './meteora/meteora.config';
import { RaydiumConfig } from './raydium/raydium.config';
import {
  UniswapConfig,
  uniswapNetworks,
  uniswapAmmNetworks,
  uniswapClmmNetworks
} from './uniswap/uniswap.config';

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
          chain: JupiterConfig.chain,
          networks: JupiterConfig.networks,
        },
        {
          name: 'meteora/clmm',
          trading_types: ['clmm', 'swap'],
          chain: MeteoraConfig.chain,
          networks: MeteoraConfig.networks,
        },
        {
          name: 'raydium/amm',
          trading_types: ['amm', 'swap'],
          chain: RaydiumConfig.chain,
          networks: RaydiumConfig.networks,
        },
        {
          name: 'raydium/clmm',
          trading_types: ['clmm', 'swap'],
          chain: RaydiumConfig.chain,
          networks: RaydiumConfig.networks,
        },
        {
          name: 'uniswap',
          trading_types: ['swap'],
          chain: 'ethereum',
          networks: uniswapNetworks,
        },
        {
          name: 'uniswap/amm',
          trading_types: ['amm', 'swap'],
          chain: 'ethereum',
          networks: uniswapAmmNetworks,
        },
        {
          name: 'uniswap/clmm',
          trading_types: ['clmm', 'swap'],
          chain: 'ethereum',
          networks: uniswapClmmNetworks,
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

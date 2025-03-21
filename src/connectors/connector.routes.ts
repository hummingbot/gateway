import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { UniswapConfig } from './uniswap/uniswap.config';
import { JupiterConfig } from './jupiter/jupiter.config';
import { MeteoraConfig } from './meteora/meteora.config';
import { RaydiumConfig } from './raydium/raydium.config';
import { logger } from '../services/logger';

// Define the schema using Typebox
const NetworkSchema = Type.Object({
  chain: Type.String(),
  networks: Type.Array(Type.String())
});

const ConnectorSchema = Type.Object({
  name: Type.String(),
  trading_types: Type.Array(Type.String()),
  available_networks: Type.Array(NetworkSchema)
});

const ConnectorsResponseSchema = Type.Object({
  connectors: Type.Array(ConnectorSchema)
});

// Type for TypeScript
type ConnectorsResponse = Static<typeof ConnectorsResponseSchema>;

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
      logger.info('Getting available DEX connectors and networks');
      
      const connectors = [
        {
          name: 'uniswap',
          trading_types: ['swap'],
          available_networks: UniswapConfig.config.availableNetworks,
        },
        {
          name: 'jupiter',
          trading_types: ['swap'],
          available_networks: JupiterConfig.config.availableNetworks,
        },
        {
          name: 'meteora_clmm',
          trading_types: ['clmm'],
          available_networks: MeteoraConfig.config.availableNetworks,
        },
        {
          name: 'raydium_amm',
          trading_types: ['amm'],
          available_networks: RaydiumConfig.config.availableNetworks,
        },
        {
          name: 'raydium_clmm',
          trading_types: ['clmm'],
          available_networks: RaydiumConfig.config.availableNetworks,
        },
      ];

      logger.info('Available connectors: ' + connectors.map(c => c.name).join(', '));

      return { connectors };
    }
  );
};

export default connectorsRoutes;

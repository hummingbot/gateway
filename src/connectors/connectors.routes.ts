import { FastifyPluginAsync } from 'fastify';
import { UniswapConfig } from './uniswap/uniswap.config';
import { JupiterConfig } from './jupiter/jupiter.config';
import { 
  ConnectorsResponse,
  ConnectorsResponseSchema 
} from './connectors.request';

export const connectorsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: ConnectorsResponse }>(
    '/',
    {
      schema: {
        description: 'Get available connectors',
        tags: ['connectors'],
        response: {
          200: ConnectorsResponseSchema
        }
      }
    },
    async () => {
      return {
        connectors: [
          {
            name: 'uniswap',
            trading_type: UniswapConfig.config.tradingTypes('swap'),
            chain_type: UniswapConfig.config.chainType,
            available_networks: UniswapConfig.config.availableNetworks as unknown as string[],
          },
          {
            name: 'jupiter',
            trading_type: JupiterConfig.config.tradingTypes,
            chain_type: JupiterConfig.config.chainType,
            available_networks: JupiterConfig.config.availableNetworks as unknown as string[],
          },
        ],
      };
    }
  );
};

export default connectorsRoutes;

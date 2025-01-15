import { FastifyPluginAsync } from 'fastify';
import { UniswapConfig } from './uniswap/uniswap.config';
import { JupiterConfig } from './jupiter/jupiter.config';
import { 
  ConnectorsResponse,
  ConnectorsResponseSchema 
} from './connector.requests';

export const connectorsResponseSchema = {
  type: 'object',
  properties: {
    connectors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          trading_type: { type: 'array', items: { type: 'string' } },
          available_networks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                chain: { type: 'string' },
                networks: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  }
} as const;

export const connectorsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: ConnectorsResponse }>(
    '/',
    {
      schema: {
        description: 'Get available connectors',
        tags: ['connectors'],
        response: {
          200: connectorsResponseSchema
        }
      }
    },
    async () => {
      console.log('Uniswap networks:', JSON.stringify(UniswapConfig.config.availableNetworks));
      console.log('Jupiter networks:', JSON.stringify(JupiterConfig.config.availableNetworks));

      return {
        connectors: [
          {
            name: 'uniswap',
            trading_type: UniswapConfig.config.tradingTypes('swap'),
            available_networks: UniswapConfig.config.availableNetworks,
          },
          {
            name: 'jupiter',
            trading_type: JupiterConfig.config.tradingTypes,
            available_networks: JupiterConfig.config.availableNetworks,
          },
        ],
      } as any;
    }
  );
};

export default connectorsRoutes;

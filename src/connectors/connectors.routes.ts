import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { UniswapConfig } from './uniswap/uniswap.config';
import { ConnectorsResponse } from './connectors.request';
import { JupiterConfig } from './jupiter/jupiter.config';

export const connectorsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: ConnectorsResponse }>(
    '/',
    {
      schema: {
        response: {
          200: Type.Object({
            connectors: Type.Array(
              Type.Object({
                name: Type.String(),
                trading_type: Type.Array(Type.String()),
                chain_type: Type.String(),
                available_networks: Type.Array(Type.String()),
              })
            ),
          }),
        },
      },
    },
    async () => {
      return {
        connectors: [
          {
            name: 'uniswap',
            trading_type: UniswapConfig.config.tradingTypes('swap'),
            chain_type: UniswapConfig.config.chainType,
            available_networks: UniswapConfig.config.availableNetworks,
          },
          {
            name: 'jupiter',
            trading_type: JupiterConfig.config.tradingTypes,
            chain_type: JupiterConfig.config.chainType,
            available_networks: JupiterConfig.config.availableNetworks,
          },
        ],
      };
    }
  );
};

export default connectorsRoutes;

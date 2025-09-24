import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { MinswapConfig } from '#src/connectors/minswap/minswap.config';
import { PancakeswapConfig } from '#src/connectors/pancakeswap/pancakeswap.config';
import { SundaeswapConfig } from '#src/connectors/sundaeswap/sundaeswap.config';

import { ZeroXConfig } from '../../connectors/0x/0x.config';
import { JupiterConfig } from '../../connectors/jupiter/jupiter.config';
import { MeteoraConfig } from '../../connectors/meteora/meteora.config';
import { RaydiumConfig } from '../../connectors/raydium/raydium.config';
import { UniswapConfig } from '../../connectors/uniswap/uniswap.config';
import { logger } from '../../services/logger';

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

// Export the connectors configuration for reuse in other parts of the codebase
export const connectorsConfig = [
  {
    name: 'jupiter',
    trading_types: [...JupiterConfig.tradingTypes],
    chain: JupiterConfig.chain,
    networks: [...JupiterConfig.networks],
  },
  {
    name: 'meteora',
    trading_types: [...MeteoraConfig.tradingTypes],
    chain: MeteoraConfig.chain,
    networks: [...MeteoraConfig.networks],
  },
  {
    name: 'raydium',
    trading_types: [...RaydiumConfig.tradingTypes],
    chain: RaydiumConfig.chain,
    networks: [...RaydiumConfig.networks],
  },
  {
    name: 'uniswap',
    trading_types: [...UniswapConfig.tradingTypes],
    chain: UniswapConfig.chain,
    networks: [...UniswapConfig.networks],
  },
  {
    name: '0x',
    trading_types: [...ZeroXConfig.tradingTypes],
    chain: ZeroXConfig.chain,
    networks: [...ZeroXConfig.networks],
  },
  {
    name: 'pancakeswap',
    trading_types: [...PancakeswapConfig.tradingTypes],
    chain: PancakeswapConfig.chain,
    networks: [...PancakeswapConfig.networks],
  },
  {
    name: 'minswap',
    trading_types: [...MinswapConfig.tradingTypes],
    chain: MinswapConfig.chain,
    networks: [...MinswapConfig.networks],
  },
  {
    name: 'sundaeswap',
    trading_types: [...SundaeswapConfig.tradingTypes],
    chain: SundaeswapConfig.chain,
    networks: [...SundaeswapConfig.networks],
  },
];

export const getConnectorsRoute: FastifyPluginAsync = async (fastify) => {
  // List available connectors
  fastify.get<{ Reply: ConnectorsResponse }>(
    '/connectors',
    {
      schema: {
        description: 'Returns a list of available DEX connectors and their supported blockchain networks.',
        tags: ['/config'],
        response: {
          200: ConnectorsResponseSchema,
        },
      },
    },
    async () => {
      logger.info('Getting available DEX connectors and networks');

      const connectors = connectorsConfig;

      logger.info('Available connectors: ' + connectors.map((c) => c.name).join(', '));

      return { connectors };
    },
  );
};

export default getConnectorsRoute;

import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { UniswapConfig } from './uniswap/uniswap.config';
import { JupiterConfig } from './jupiter/jupiter.config';
import { MeteoraConfig } from './meteora/meteora.config';
import { RaydiumConfig } from './raydium/raydium.config';
import { HydrationConfig } from './hydration/hydration.config';
import { logger } from '../services/logger';
import axios from 'axios';
import {
  GetPoolInfoRequestType,
  GetPoolInfoRequest,
  GetPoolInfoResponse,
  PoolInfo
} from '../schemas/trading-types/swap-schema';

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
  // Add poolInfo route across all connectors
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: { pools: PoolInfo[] };
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information across all available connectors for a token pair',
        tags: ['connectors'],
        querystring: {
          ...GetPoolInfoRequest.properties,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            connector: { type: 'string', examples: ['jupiter'], description: 'Optional: specific connector to check' },
            marketType: { type: 'string', examples: ['amm'], description: 'Optional: specific market type to check' }
          },
          required: ['baseToken', 'quoteToken']
        },
        response: {
          200: GetPoolInfoResponse
        }
      }
    },
    async (request) => {
      try {
        const { baseToken, quoteToken, connector, marketType } = request.query;
        const network = request.query.network || 'mainnet-beta';
        const allPools: PoolInfo[] = [];

        // List of connectors and their endpoints to check
        const connectors = [
          // Solana-based connectors
          { name: 'jupiter', endpoint: '/jupiter/pool-info', chain: 'solana' },
          { name: 'raydium', endpoint: '/raydium/amm/pool-info', chain: 'solana', marketType: 'amm' },
          { name: 'raydium', endpoint: '/raydium/clmm/pool-info', chain: 'solana', marketType: 'clmm' },
          { name: 'meteora', endpoint: '/meteora/clmm/pool-info', chain: 'solana', marketType: 'clmm' },
          // Ethereum-based connectors
          { name: 'uniswap', endpoint: '/uniswap/amm/pool-info', chain: 'ethereum', marketType: 'amm' },
          { name: 'uniswap', endpoint: '/uniswap/clmm/pool-info', chain: 'ethereum', marketType: 'clmm' },
          // Polkadot-based connectors
          { name: 'hydration', endpoint: '/hydration/amm/pool-info', chain: 'polkadot', marketType: 'amm' }
        ];

        // Filter the connectors if a specific one was requested
        const filteredConnectors = connectors.filter(c => {
          if (connector && c.name !== connector) return false;
          if (marketType && c.marketType !== marketType) return false;
          return true;
        });

        // Fetch pool info from all applicable connectors in parallel
        const serverAddress = fastify.server.address();
        const baseUrl = typeof serverAddress === 'string'
          ? serverAddress
          : `http://localhost:${serverAddress.port}`;

        const poolRequests = filteredConnectors.map(async (c) => {
          try {
            const queryParams = new URLSearchParams({
              baseToken: baseToken,
              quoteToken: quoteToken,
              network: network
            }).toString();

            const url = `${baseUrl}${c.endpoint}?${queryParams}`;
            logger.debug(`Fetching pool info from: ${url}`);

            const response = await axios.get(url, { timeout: 5000 });

            // Parse and add connector-specific details to pool info
            if (response.data && response.data.pools && Array.isArray(response.data.pools)) {
              response.data.pools.forEach((pool: PoolInfo) => {
                // Ensure connector name and market type are added to each pool entry
                if (!pool.connectorName) pool.connectorName = c.name;
                if (!pool.marketType && c.marketType) pool.marketType = c.marketType;
                allPools.push(pool);
              });
            }
          } catch (error) {
            // Log the error but continue with other connectors
            logger.warn(`Error fetching pool info from ${c.name} (${c.marketType || 'default'}): ${error.message}`);
          }
        });

        // Wait for all requests to finish
        await Promise.all(poolRequests);

        return { pools: allPools };
      } catch (e) {
        logger.error(`Error in connector poolInfo route: ${e}`);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info from connectors');
      }
    }
  );

  // List available connectors
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
          name: 'raydium/launchpad',
          trading_types: ['swap'],
          available_networks: RaydiumConfig.config.availableNetworks,
        },
        {
          name: 'hydration/amm',
          trading_types: HydrationConfig.config.tradingTypes,
          available_networks: HydrationConfig.config.availableNetworks,
        },
      ];

      logger.info('Available connectors: ' + connectors.map(c => c.name).join(', '));

      return { connectors };
    }
  );
};

export default connectorsRoutes;

import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { TopPoolInfo } from '../../services/coingecko-service';
import { extractRawPoolData, toPoolGeckoData } from '../../services/gecko-types';
import { handlePoolError } from '../pool-error-handler';
import { findPools } from '../pool-finder';
import { fetchDetailedPoolInfo } from '../pool-lookup-helper';
import {
  FindPoolsQuery,
  FindPoolsQuerySchema,
  FindPoolsResponse,
  FindPoolsResponseSchema,
  PoolInfoSchema,
} from '../schemas';
import { Pool } from '../types';

/**
 * Transform TopPoolInfo from CoinGecko to PoolInfo format
 * Uses typed transformation helper to ensure consistent geckoData format
 */
function transformToPoolInfo(topPoolInfo: TopPoolInfo): Pool {
  // Extract and transform geckoData using typed helpers
  const rawPoolData = extractRawPoolData(topPoolInfo);
  const geckoData = toPoolGeckoData(rawPoolData);

  return {
    type: topPoolInfo.type as 'amm' | 'clmm',
    network: '', // Will be filled from chainNetwork
    baseSymbol: topPoolInfo.baseTokenSymbol,
    quoteSymbol: topPoolInfo.quoteTokenSymbol,
    baseTokenAddress: topPoolInfo.baseTokenAddress,
    quoteTokenAddress: topPoolInfo.quoteTokenAddress,
    feePct: 0, // Not available from TopPoolInfo, would need to fetch from connector
    address: topPoolInfo.poolAddress,
    geckoData,
  };
}

export const findPoolsRoute: FastifyPluginAsync = async (fastify) => {
  // GET /pools/find/:address - Get detailed pool info by address
  fastify.get<{
    Params: { address: string };
    Querystring: { chainNetwork: string };
    Reply: typeof PoolInfoSchema.static;
  }>(
    '/find/:address',
    {
      schema: {
        description: 'Get detailed pool information by address from GeckoTerminal',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Pool contract address',
              examples: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'],
            },
          },
          required: ['address'],
        },
        querystring: Type.Object({
          chainNetwork: FindPoolsQuerySchema.properties.chainNetwork,
        }),
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;

      try {
        // Fetch detailed pool information using shared helper
        const { pool } = await fetchDetailedPoolInfo(chainNetwork, address);

        // Return pool data in PoolInfo format with geckoData
        return pool;
      } catch (error: any) {
        handlePoolError(fastify, error, `Failed to get pool info for ${address}`);
      }
    },
  );

  // GET /pools/find - Search for pools by token pair
  fastify.get<{
    Querystring: FindPoolsQuery;
    Reply: FindPoolsResponse;
  }>(
    '/find',
    {
      schema: {
        description: 'Find pools for a token pair from GeckoTerminal',
        tags: ['/pools'],
        querystring: FindPoolsQuerySchema,
        response: {
          200: FindPoolsResponseSchema,
        },
      },
    },
    async (request) => {
      const { tokenA, tokenB, chainNetwork, pages = 10, connector, type = 'clmm' } = request.query;

      try {
        const topPools = await findPools(chainNetwork, {
          tokenA,
          tokenB,
          connector,
          type: type as 'amm' | 'clmm',
          page: pages,
        });

        // Transform TopPoolInfo to PoolInfo format
        // Extract network from chainNetwork (format: chain-network)
        const network = chainNetwork.split('-').slice(1).join('-');

        const pools = topPools.map((topPool) => {
          const pool = transformToPoolInfo(topPool);
          pool.network = network;
          return pool;
        });

        return pools;
      } catch (error: any) {
        handlePoolError(fastify, error, 'Failed to find pools');
      }
    },
  );
};

export default findPoolsRoute;

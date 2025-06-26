import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  PoolsQuery,
  PoolsQuerySchema,
  DefaultPoolListSchema,
} from '../schemas';
import { getDefaultPools } from '../utils';

export const getPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: PoolsQuery;
    Reply: Record<string, string>;
  }>(
    '/pools',
    {
      schema: {
        description: 'Get default pools for a specific connector and pool type',
        tags: ['system'],
        querystring: PoolsQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: {
              type: 'string',
            },
            description: 'Pool addresses by token pair',
            examples: [
              {
                // Raydium AMM examples
                'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
                'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
              },
              {
                // Raydium CLMM examples
                'SOL-USDC': '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
                'RAY-USDC': '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht',
              },
              {
                // Uniswap AMM examples
                'ETH-USDC': '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
                'ETH-USDT': '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852',
              },
              {
                // Uniswap CLMM examples
                'ETH-USDC': '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
                'ETH-USDT': '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36',
              },
              {
                // Meteora CLMM examples
                'SOL-USDC': '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
                'USDT-USDC': 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq',
              },
              {
                // Minswap AMM examples
                'ADA-MIN':
                  '6aa2153e1ae896a95539c9d62f76cedcdabdcdf144e564b8955f609d660cf6a2',
              },
              {
                // Sundaeswap AMM examples
                'ADA-SUNDAE':
                  '2baab4c73a1cd60176f903a29a9c92ed4237c88622da51e9179121a3',
              },
            ],
          },
        },
      },
    },
    async (request) => {
      const { connector } = request.query;
      return getDefaultPools(fastify, connector);
    },
  );
};

export default getPoolsRoute;

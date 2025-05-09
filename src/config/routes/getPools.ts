import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { logger } from '../../services/logger';
import { getDefaultPools } from '../utils';
import { PoolsQuery, PoolsQuerySchema, DefaultPoolListSchema } from '../schemas';

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
          200: Type.Record(
            Type.String({
              pattern: '^[A-Z]+-[A-Z]+$',
              description: 'Token pair in the format BASE-QUOTE (e.g., SOL-USDC, ETH-USDC)'
            }),
            Type.String({
              description: 'Pool address for the token pair'
            })
          ),
          examples: [
            {
              // Raydium AMM examples
              'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
              'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'
            },
            {
              // Raydium CLMM examples
              'SOL-USDC': '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
              'RAY-USDC': '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht'
            },
            {
              // Uniswap AMM examples
              'ETH-USDC': '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
              'ETH-USDT': '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852'
            },
            {
              // Uniswap CLMM examples
              'ETH-USDC': '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
              'ETH-USDT': '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36'
            },
            {
              // Meteora CLMM examples
              'SOL-USDC': '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
              'USDT-USDC': 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq'
            }
          ]
        }
      }
    },
    async (request) => {
      const { connector } = request.query;
      return getDefaultPools(fastify, connector);
    }
  );
};

export default getPoolsRoute;
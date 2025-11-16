import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';
import { handlePoolError } from '../pool-error-handler';
import { fetchDetailedPoolInfo } from '../pool-lookup-helper';
import { FindPoolsQuerySchema, PoolInfoSchema } from '../schemas';
import { Pool } from '../types';

export const savePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { address: string };
    Querystring: { chainNetwork: string };
    Reply: { message: string; pool: Pool };
  }>(
    '/save/:address',
    {
      schema: {
        description: 'Find pool from GeckoTerminal and save it to the pool list',
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
          200: Type.Object({
            message: Type.String(),
            pool: PoolInfoSchema,
          }),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;

      try {
        // Fetch detailed pool information using shared helper
        const { poolData, pool } = await fetchDetailedPoolInfo(chainNetwork, address);

        // Check if pool already exists
        const poolService = PoolService.getInstance();
        const existingPool = await poolService.getPoolByAddress(poolData.connector, address);

        if (existingPool) {
          // Update existing pool with latest market data
          logger.info(
            `Pool ${pool.baseSymbol}-${pool.quoteSymbol} (${address}) already exists, updating with latest data`,
          );
          await poolService.updatePoolByAddress(poolData.connector, pool);
          return {
            message: `Pool ${pool.baseSymbol}-${pool.quoteSymbol} already exists in the pool list for ${poolData.connector}, updated with latest data`,
            pool,
          };
        }

        // Add pool to the list
        await poolService.addPool(poolData.connector, pool);
        logger.info(
          `Saved pool ${pool.baseSymbol}-${pool.quoteSymbol} (${address}) to ${poolData.connector} ${poolData.type}`,
        );

        return {
          message: `Pool ${pool.baseSymbol}-${pool.quoteSymbol} has been added to the pool list for ${poolData.connector}`,
          pool,
        };
      } catch (error: any) {
        handlePoolError(fastify, error, 'Failed to find and save pool');
      }
    },
  );
};

export default savePoolRoute;

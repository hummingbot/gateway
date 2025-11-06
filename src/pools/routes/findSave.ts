import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';
import { findPools } from '../pool-finder';
import { fetchPoolInfo, resolveTokenSymbols } from '../pool-info-helpers';
import { FindSavePoolsQuery, FindSavePoolsQuerySchema, PoolInfoSchema } from '../schemas';
import { Pool } from '../types';

export const findSavePoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Querystring: FindSavePoolsQuery;
    Reply: { message: string; pools: Pool[] };
  }>(
    '/find-save',
    {
      schema: {
        description: 'Find pools from GeckoTerminal and save them to the pool list',
        tags: ['/pools'],
        querystring: FindSavePoolsQuerySchema,
        response: {
          200: Type.Object({
            message: Type.String(),
            pools: Type.Array(
              Type.Object({
                type: Type.String({
                  description: 'Pool type',
                  examples: ['clmm', 'amm'],
                  enum: ['clmm', 'amm'],
                }),
                network: Type.String(),
                baseSymbol: Type.String(),
                quoteSymbol: Type.String(),
                baseTokenAddress: Type.String(),
                quoteTokenAddress: Type.String(),
                feePct: Type.Number(),
                address: Type.String(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const { tokenA, tokenB, chainNetwork, page = 3, connector, type = 'clmm', saveLimit = 1 } = request.query;

      try {
        // Parse chain-network parameter using CoinGeckoService
        const coinGeckoService = CoinGeckoService.getInstance();
        const { network } = coinGeckoService.parseChainNetwork(chainNetwork);

        // Find pools using shared logic
        const pools = await findPools(chainNetwork, {
          tokenA,
          tokenB,
          connector,
          type: type as 'amm' | 'clmm',
          page,
        });

        if (pools.length === 0) {
          logger.warn('No pools found to save');
          return {
            message: 'No pools found',
            pools: [],
          };
        }

        // Save pools up to saveLimit
        const poolService = PoolService.getInstance();
        const savedPools: Pool[] = [];
        const failedPools: Array<{ address: string; connector: string; reason: string }> = [];

        // Only process pools up to saveLimit + small buffer for failures
        const poolsToProcess = pools.slice(0, Math.min(pools.length, saveLimit * 3));
        if (poolsToProcess.length < pools.length) {
          logger.info(
            `Limiting pool processing to ${poolsToProcess.length} of ${pools.length} found (saveLimit: ${saveLimit})`,
          );
        }

        for (const poolData of poolsToProcess) {
          // Stop if we've reached the save limit
          if (savedPools.length >= saveLimit) {
            logger.info(`Reached save limit of ${saveLimit} pools`);
            break;
          }

          try {
            // Validate that we have connector info
            if (!poolData.connector || !poolData.type) {
              const reason = 'No connector/type mapping from GeckoTerminal';
              logger.warn(`Pool ${poolData.poolAddress} has no connector/type mapping, skipping`);
              failedPools.push({ address: poolData.poolAddress, connector: 'unknown', reason });
              continue;
            }

            // Fetch detailed pool info from the connector
            const poolInfo = await fetchPoolInfo(
              poolData.connector,
              poolData.type as 'amm' | 'clmm',
              network,
              poolData.poolAddress,
            );

            if (!poolInfo) {
              const reason = `Unable to fetch pool-info (connector: ${poolData.connector} may not be supported)`;
              logger.warn(`Unable to fetch pool-info for ${poolData.poolAddress}, skipping`);
              failedPools.push({ address: poolData.poolAddress, connector: poolData.connector, reason });
              continue;
            }

            // Resolve token symbols - handle missing tokens gracefully
            let baseSymbol: string;
            let quoteSymbol: string;

            try {
              const symbols = await resolveTokenSymbols(
                poolData.connector,
                network,
                poolInfo.baseTokenAddress,
                poolInfo.quoteTokenAddress,
              );
              baseSymbol = symbols.baseSymbol;
              quoteSymbol = symbols.quoteSymbol;
            } catch (tokenError: any) {
              const reason = `Failed to resolve token symbols: ${tokenError.message}`;
              logger.warn(`${reason} for pool ${poolData.poolAddress}, skipping`);
              failedPools.push({ address: poolData.poolAddress, connector: poolData.connector, reason });
              continue;
            }

            // Create pool object
            const pool: Pool = {
              type: poolData.type as 'amm' | 'clmm',
              network,
              baseSymbol,
              quoteSymbol,
              baseTokenAddress: poolInfo.baseTokenAddress,
              quoteTokenAddress: poolInfo.quoteTokenAddress,
              feePct: poolInfo.feePct,
              address: poolData.poolAddress,
            };

            // Check if pool already exists
            const existingPool = await poolService.getPoolByAddress(poolData.connector, poolData.poolAddress);

            if (existingPool) {
              logger.info(
                `Pool ${baseSymbol}-${quoteSymbol} (${poolData.poolAddress}) already exists, adding to response`,
              );
              savedPools.push(pool);
              continue;
            }

            // Add pool to the list
            await poolService.addPool(poolData.connector, pool);
            logger.info(
              `Saved pool ${baseSymbol}-${quoteSymbol} (${poolData.poolAddress}) to ${poolData.connector} ${poolData.type}`,
            );
            savedPools.push(pool);
          } catch (error: any) {
            logger.error(`Error saving pool ${poolData.poolAddress}: ${error.message}`);
            failedPools.push({
              address: poolData.poolAddress,
              connector: poolData.connector || 'unknown',
              reason: error.message,
            });
          }
        }

        let message =
          savedPools.length > 0 ? `Successfully processed ${savedPools.length} pool(s)` : 'No pools were saved';

        if (failedPools.length > 0) {
          // Group failures by reason
          const failuresByReason = failedPools.reduce(
            (acc, f) => {
              const key = f.reason;
              if (!acc[key]) {
                acc[key] = { count: 0, connector: f.connector, addresses: [] };
              }
              acc[key].count++;
              if (acc[key].addresses.length < 3) {
                // Only show first 3 addresses
                acc[key].addresses.push(f.address);
              }
              return acc;
            },
            {} as Record<string, { count: number; connector: string; addresses: string[] }>,
          );

          const failureSummary = Object.entries(failuresByReason)
            .map(([reason, info]) => {
              const addrList = info.addresses.join(', ');
              const more = info.count > 3 ? ` and ${info.count - 3} more` : '';
              return `${reason} (${info.connector}): ${addrList}${more}`;
            })
            .join('; ');

          message += `. Failed: ${failedPools.length} pool(s) - ${failureSummary}`;
        }

        return {
          message,
          pools: savedPools,
        };
      } catch (error: any) {
        logger.error(`Failed to find and save pools: ${error.message}`);

        // Re-throw if it's already an HTTP error
        if (error.statusCode) {
          throw error;
        }

        if (error.message.includes('Unsupported network')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('Invalid chainNetwork') || error.message.includes('Unsupported chainNetwork')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to find and save pools from GeckoTerminal');
      }
    },
  );
};

export default findSavePoolsRoute;

import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { fetchPoolInfo, resolveTokenSymbols } from '../pool-info-helpers';
import { PoolAddRequestSchema, PoolSuccessResponseSchema } from '../schemas';
import { PoolAddRequest, Pool } from '../types';

export const addPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: PoolAddRequest }>(
    '/',
    {
      schema: {
        description: 'Add a new pool',
        tags: ['/pools'],
        body: PoolAddRequestSchema,
        response: {
          200: PoolSuccessResponseSchema,
          400: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const {
        connector,
        type,
        network,
        address,
        baseSymbol,
        quoteSymbol,
        baseTokenAddress,
        quoteTokenAddress,
        feePct,
      } = request.body;

      const poolService = PoolService.getInstance();

      try {
        // Step 1: Determine if we need to fetch pool-info for feePct
        let finalFeePct = feePct;

        if (finalFeePct === undefined) {
          // Fetch pool-info to get fee percentage
          const poolInfo = await fetchPoolInfo(connector, type, network, address);

          if (!poolInfo) {
            throw fastify.httpErrors.notFound(`Pool not found or unable to fetch pool info: ${address}`);
          }

          finalFeePct = poolInfo.feePct;
        }

        // Step 2: Resolve token symbols (if not provided by user)
        let finalBaseSymbol = baseSymbol;
        let finalQuoteSymbol = quoteSymbol;

        if (!finalBaseSymbol || !finalQuoteSymbol) {
          const { baseSymbol: resolvedBase, quoteSymbol: resolvedQuote } = await resolveTokenSymbols(
            connector,
            network,
            baseTokenAddress,
            quoteTokenAddress,
          );

          finalBaseSymbol = finalBaseSymbol || resolvedBase;
          finalQuoteSymbol = finalQuoteSymbol || resolvedQuote;
        }

        // Step 3: Create enhanced pool object
        const pool: Pool = {
          type,
          network,
          baseSymbol: finalBaseSymbol,
          quoteSymbol: finalQuoteSymbol,
          baseTokenAddress,
          quoteTokenAddress,
          feePct: finalFeePct,
          address,
        };

        // Step 4: Check if a pool with same token pair already exists (ignoring feePct)
        const existingPoolByMetadata = await poolService.getPoolByMetadata(
          connector,
          type,
          network,
          baseTokenAddress,
          quoteTokenAddress,
        );

        if (existingPoolByMetadata) {
          if (existingPoolByMetadata.address.toLowerCase() === address.toLowerCase()) {
            // Same pool (same address and token pair), just update it (fee tier may have changed)
            await poolService.updatePool(connector, pool);
            return {
              message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} updated to ${finalFeePct}% fee in ${connector} ${type} on ${network}`,
            };
          } else {
            // Different address but same token pair - replace the old pool
            await poolService.removePool(connector, network, type, existingPoolByMetadata.address);
            await poolService.addPool(connector, pool);
            return {
              message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} (${finalFeePct}% fee) replaced (old: ${existingPoolByMetadata.address} ${existingPoolByMetadata.feePct}% fee, new: ${address}) in ${connector} ${type} on ${network}`,
            };
          }
        }

        // Step 5: No pool with matching metadata exists - check if address is used
        const existingPoolByAddress = await poolService.getPoolByAddress(connector, address);

        if (existingPoolByAddress) {
          // Address exists but with different metadata - this shouldn't happen normally
          // but we'll update it anyway
          await poolService.updatePool(connector, pool);
          return {
            message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} (${finalFeePct}% fee) updated successfully in ${connector} ${type} on ${network}`,
          };
        }

        // Step 6: Completely new pool - add it
        await poolService.addPool(connector, pool);
        return {
          message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} (${finalFeePct}% fee) added successfully to ${connector} ${type} on ${network}`,
        };
      } catch (error) {
        if (error.statusCode) {
          throw error; // Already a Fastify error
        }
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

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
        // Step 1: Determine if we need to fetch pool-info
        const needsPoolInfo = !baseTokenAddress || !quoteTokenAddress || feePct === undefined;

        let finalBaseTokenAddress = baseTokenAddress;
        let finalQuoteTokenAddress = quoteTokenAddress;
        let finalFeePct = feePct;

        if (needsPoolInfo) {
          // Fetch pool-info to get missing data
          const poolInfo = await fetchPoolInfo(connector, type, network, address);

          if (!poolInfo) {
            throw fastify.httpErrors.notFound(`Pool not found or unable to fetch pool info: ${address}`);
          }

          finalBaseTokenAddress = finalBaseTokenAddress || poolInfo.baseTokenAddress;
          finalQuoteTokenAddress = finalQuoteTokenAddress || poolInfo.quoteTokenAddress;
          finalFeePct = finalFeePct !== undefined ? finalFeePct : poolInfo.feePct;
        }

        // Step 2: Resolve token symbols (if not provided by user)
        let finalBaseSymbol = baseSymbol;
        let finalQuoteSymbol = quoteSymbol;

        if (!finalBaseSymbol || !finalQuoteSymbol) {
          const { baseSymbol: resolvedBase, quoteSymbol: resolvedQuote } = await resolveTokenSymbols(
            connector,
            network,
            finalBaseTokenAddress,
            finalQuoteTokenAddress,
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
          baseTokenAddress: finalBaseTokenAddress,
          quoteTokenAddress: finalQuoteTokenAddress,
          feePct: finalFeePct,
          address,
        };

        // Step 4: Check if pool already exists by address
        const existingPool = await poolService.getPoolByAddress(connector, address);

        if (existingPool) {
          // Update existing pool
          await poolService.updatePool(connector, pool);
          return {
            message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} (${finalFeePct}% fee) updated successfully in ${connector} ${type} on ${network}`,
          };
        } else {
          // Add new pool
          await poolService.addPool(connector, pool);
          return {
            message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} (${finalFeePct}% fee) added successfully to ${connector} ${type} on ${network}`,
          };
        }
      } catch (error) {
        if (error.statusCode) {
          throw error; // Already a Fastify error
        }
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

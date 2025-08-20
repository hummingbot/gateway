import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { PoolSuccessResponseSchema } from '../schemas';

export const removePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Params: { address: string };
    Querystring: {
      connector: string;
      network: string;
      type: 'amm' | 'clmm';
    };
  }>(
    '/:address',
    {
      schema: {
        description: 'Remove a pool by address',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Pool contract address to remove',
            },
          },
          required: ['address'],
        },
        querystring: Type.Object({
          connector: Type.String({
            description: 'Connector (raydium, meteora, uniswap)',
            examples: ['raydium', 'meteora', 'uniswap'],
          }),
          network: Type.String({
            description: 'Network name (mainnet, mainnet-beta, etc)',
            examples: ['mainnet', 'mainnet-beta'],
          }),
          type: Type.Union([Type.Literal('amm'), Type.Literal('clmm')], {
            description: 'Pool type',
          }),
        }),
        response: {
          200: PoolSuccessResponseSchema,
          404: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { connector, network, type } = request.query;
      const poolService = PoolService.getInstance();

      try {
        await poolService.removePool(connector, network, type, address);

        return {
          message: `Pool with address ${address} removed successfully from ${connector} ${type} on ${network}`,
        };
      } catch (error) {
        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

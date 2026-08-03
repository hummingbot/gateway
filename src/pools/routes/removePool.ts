import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { PoolSuccessResponseSchema } from '../schemas';

export const removePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Params: { address: string };
    Querystring: {
      chain: string;
      network: string;
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
          chain: Type.String({
            description: 'Blockchain chain (solana, ethereum)',
            examples: ['solana', 'ethereum'],
          }),
          network: Type.String({
            description: 'Network name (mainnet, mainnet-beta, etc)',
            examples: ['mainnet', 'mainnet-beta'],
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
      const { chain, network } = request.query;
      const poolService = PoolService.getInstance();

      try {
        await poolService.removePool(chain, network, address);

        return {
          message: `Pool with address ${address} removed successfully from ${chain}/${network}`,
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

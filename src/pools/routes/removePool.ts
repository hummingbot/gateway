import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { chainNetworkField } from '../../schemas/chain-network-field';
import { parseChainNetwork } from '../../services/chain-network';
import { PoolService } from '../../services/pool-service';
import { PoolSuccessResponseSchema } from '../schemas';

export const removePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Params: { address: string };
    Querystring: {
      chainNetwork: string;
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
        querystring: Type.Object({ chainNetwork: chainNetworkField({ defaulted: false }) }),
        response: {
          200: PoolSuccessResponseSchema,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;
      const { chain, network } = parseChainNetwork(chainNetwork);
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

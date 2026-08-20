import { FastifyPluginAsync } from 'fastify';

import { parseChainNetwork } from '../../services/chain-network';
import { TokenService } from '../../services/token-service';
import {
  TokenRemoveQuery,
  TokenRemoveQuerySchema,
  TokenOperationResponse,
  TokenOperationResponseSchema,
} from '../schemas';
import { handleTokenError } from '../token-error-handler';

export const removeTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Params: { address: string };
    Querystring: TokenRemoveQuery;
    Reply: TokenOperationResponse;
  }>(
    '/:address',
    {
      schema: {
        description: 'Remove a token from a token list by address',
        tags: ['/tokens'],
        params: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Token address to remove',
            },
          },
          required: ['address'],
        },
        querystring: TokenRemoveQuerySchema,
        response: {
          200: TokenOperationResponseSchema,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;
      const { chain, network } = parseChainNetwork(chainNetwork);

      try {
        const tokenService = TokenService.getInstance();
        await tokenService.removeToken(chain, network, address);

        return {
          message: `Token with address ${address} removed successfully from ${chain}/${network}.`,
        };
      } catch (error) {
        handleTokenError(fastify, error, 'Failed to remove token');
      }
    },
  );
};

export default removeTokenRoute;

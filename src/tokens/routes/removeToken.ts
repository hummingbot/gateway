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
    Params: { symbolOrAddress: string };
    Querystring: TokenRemoveQuery;
    Reply: TokenOperationResponse;
  }>(
    // The same path as GET /tokens/{symbolOrAddress}, and the same parameter: a consumer that
    // reads the route table by path shape sees one resource here, and one it is (#689).
    '/:symbolOrAddress',
    {
      schema: {
        description: 'Remove a token from a token list by symbol or address',
        tags: ['/tokens'],
        params: {
          type: 'object',
          properties: {
            symbolOrAddress: {
              type: 'string',
              description: 'Token symbol or address to remove',
            },
          },
          required: ['symbolOrAddress'],
        },
        querystring: TokenRemoveQuerySchema,
        response: {
          200: TokenOperationResponseSchema,
        },
      },
    },
    async (request) => {
      const { symbolOrAddress } = request.params;
      const { chainNetwork } = request.query;
      const { chain, network } = parseChainNetwork(chainNetwork);

      try {
        const tokenService = TokenService.getInstance();
        const token = await tokenService.getToken(chain, network, symbolOrAddress);
        if (!token) {
          throw fastify.httpErrors.notFound(`Token ${symbolOrAddress} not found in ${chain}/${network}`);
        }
        await tokenService.removeToken(chain, network, token.address);

        return {
          message: `Token ${token.symbol} (${token.address}) removed successfully from ${chain}/${network}.`,
        };
      } catch (error) {
        if (error.statusCode === 404) {
          throw error;
        }
        handleTokenError(fastify, error, 'Failed to remove token');
      }
    },
  );
};

export default removeTokenRoute;

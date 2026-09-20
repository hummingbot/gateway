import { FastifyPluginAsync } from 'fastify';

import { parseChainNetwork } from '../../services/chain-network';
import { TokenService } from '../../services/token-service';
import {
  TokenAddRequest,
  TokenAddRequestSchema,
  TokenOperationResponse,
  TokenOperationResponseSchema,
} from '../schemas';
import { handleTokenError } from '../token-error-handler';

export const addTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: TokenAddRequest; Reply: TokenOperationResponse }>(
    '/',
    {
      schema: {
        description: 'Add a new token to a token list',
        tags: ['/tokens'],
        body: TokenAddRequestSchema,
        response: {
          200: TokenOperationResponseSchema,
        },
      },
    },
    async (request) => {
      const { chainNetwork, token } = request.body;
      const { chain, network } = parseChainNetwork(chainNetwork);

      try {
        const tokenService = TokenService.getInstance();
        await tokenService.addToken(chain, network, token);

        return {
          message: `Token ${token.symbol} added/updated successfully in ${chain}/${network}.`,
        };
      } catch (error) {
        handleTokenError(fastify, error, 'Failed to add token');
      }
    },
  );
};

export default addTokenRoute;

import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import {
  TokenRemoveQuery,
  TokenRemoveQuerySchema,
  TokenOperationResponse,
  TokenOperationResponseSchema,
} from '../schemas';

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
      const { chain, network } = request.query;

      try {
        const tokenService = TokenService.getInstance();
        await tokenService.removeToken(chain, network, address);

        return {
          message: `Token with address ${address} removed successfully from ${chain}/${network}. Gateway restart required.`,
          requiresRestart: true,
        };
      } catch (error) {
        logger.error(`Failed to remove token: ${error.message}`);

        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }

        if (error.message.includes('Unsupported chain')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to remove token');
      }
    },
  );
};

export default removeTokenRoute;

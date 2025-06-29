import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import {
  TokenAddRequest,
  TokenAddRequestSchema,
  TokenOperationResponse,
  TokenOperationResponseSchema,
} from '../schemas';

export const addTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: TokenAddRequest; Reply: TokenOperationResponse }>(
    '/',
    {
      schema: {
        description: 'Add a new token to a token list',
        tags: ['tokens'],
        body: TokenAddRequestSchema,
        response: {
          200: TokenOperationResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, network, token } = request.body;

      try {
        const tokenService = TokenService.getInstance();
        await tokenService.addToken(chain, network, token);

        return {
          message: `Token ${token.symbol} added successfully to ${chain}/${network}. Gateway restart required.`,
          requiresRestart: true,
        };
      } catch (error) {
        logger.error(`Failed to add token: ${error.message}`);

        if (error.message.includes('already exists')) {
          throw fastify.httpErrors.conflict(error.message);
        }

        if (
          error.message.includes('Invalid') ||
          error.message.includes('required')
        ) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('Unsupported chain')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to add token');
      }
    },
  );
};

export default addTokenRoute;

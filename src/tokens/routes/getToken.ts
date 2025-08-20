import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { TokenViewQuery, TokenViewQuerySchema, TokenResponse, TokenResponseSchema } from '../schemas';

export const getTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { symbolOrAddress: string };
    Querystring: TokenViewQuery;
    Reply: TokenResponse;
  }>(
    '/:symbolOrAddress',
    {
      schema: {
        description: 'Get a specific token by symbol or address',
        tags: ['/tokens'],
        params: {
          type: 'object',
          properties: {
            symbolOrAddress: {
              type: 'string',
              description: 'Token symbol or address',
            },
          },
          required: ['symbolOrAddress'],
        },
        querystring: TokenViewQuerySchema,
        response: {
          200: TokenResponseSchema,
        },
      },
    },
    async (request) => {
      const { symbolOrAddress } = request.params;
      const { chain, network } = request.query;

      try {
        const tokenService = TokenService.getInstance();
        const token = await tokenService.getToken(chain, network, symbolOrAddress);

        if (!token) {
          throw fastify.httpErrors.notFound(`Token ${symbolOrAddress} not found in ${chain}/${network}`);
        }

        return {
          token,
          chain,
          network,
        };
      } catch (error) {
        // Don't log "not found" errors as they are expected when searching across chains
        if (error.statusCode === 404 || error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(`Token ${symbolOrAddress} not found in ${chain}/${network}`);
        }

        // Log actual errors
        logger.error(`Failed to get token: ${error.message}`);

        if (error.message.includes('Unsupported chain')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to get token');
      }
    },
  );
};

export default getTokenRoute;

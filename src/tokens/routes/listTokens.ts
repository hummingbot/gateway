import { FastifyPluginAsync } from 'fastify';

import { TokenService } from '../../services/token-service';
import { logger } from '../../services/logger';
import { 
  TokenListQuery, 
  TokenListQuerySchema, 
  TokenListResponse, 
  TokenListResponseSchema 
} from '../schemas';

export const listTokensRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: TokenListQuery; Reply: TokenListResponse }>(
    '/',
    {
      schema: {
        description: 'List tokens from token lists with optional filtering',
        tags: ['tokens'],
        querystring: TokenListQuerySchema,
        response: {
          200: TokenListResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, network, search } = request.query;

      try {
        if (!chain || !network) {
          // If chain or network not specified, return empty list
          return {
            tokens: [],
          };
        }

        const tokenService = TokenService.getInstance();
        const tokens = await tokenService.listTokens(
          chain,
          network,
          search
        );

        return {
          tokens,
        };
      } catch (error) {
        logger.error(`Failed to list tokens: ${error.message}`);
        
        if (error.message.includes('Unsupported chain')) {
          throw fastify.httpErrors.badRequest(error.message);
        }
        
        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }
        
        throw fastify.httpErrors.internalServerError('Failed to list tokens');
      }
    }
  );
};

export default listTokensRoute;
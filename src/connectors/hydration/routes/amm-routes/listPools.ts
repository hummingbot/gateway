import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Hydration} from '../../hydration';
import {
  HydrationListPoolsRequest,
  HydrationListPoolsRequestSchema,
  HydrationListPoolsResponse,
  HydrationListPoolsResponseSchema
} from '../../hydration.types';
import {HttpException} from '../../../../services/error-handler';
import {logger} from '../../../../services/logger';

/**
 * Extended request parameters for listPools endpoint with additional filtering options.
 */
interface ExtendedListPoolsRequest extends HydrationListPoolsRequest {
  types?: string[];
  maxNumberOfPages?: number;
  useOfficialTokens?: boolean;
  tokenSymbols?: string[];
  tokenAddresses?: string[];
}

/**
 * Lists available pools on the Hydration protocol with filtering options.
 * 
 * @param fastify - Fastify instance
 * @param network - The blockchain network (e.g., 'mainnet')
 * @param types - Array of pool types to filter by (e.g., ['xyk', 'stableswap'])
 * @param tokenSymbols - Array of token symbols to filter by
 * @param tokenAddresses - Array of token addresses to filter by
 * @param useOfficialTokens - Whether to use official token list for symbol resolution
 * @param maxNumberOfPages - Maximum number of pages to fetch
 * @returns List of filtered pools
 */
export async function listHydrationPools(
  _fastify: FastifyInstance,
  network: string,
  types: string[] = [],
  tokenSymbols: string[] = [],
  tokenAddresses: string[] = [],
  useOfficialTokens: boolean = true,
  maxNumberOfPages: number = 1
): Promise<HydrationListPoolsResponse> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }

  const hydration = await Hydration.getInstance(network);
  if (!hydration) {
    throw new HttpException(503, 'Hydration service unavailable', -1);
  }
  
  const pools = await hydration.listPools(
    types,
    tokenSymbols,
    tokenAddresses,
    useOfficialTokens,
    maxNumberOfPages
  );

  return { pools };
}

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route plugin that registers the list-pools endpoint.
 * Exposes an endpoint for listing all available pools with filtering options.
 */
export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: ExtendedListPoolsRequest;
    Reply: HydrationListPoolsResponse | ErrorResponse;
  }>(
    '/list-pools',
    {
      schema: {
        description: 'List all available Hydration pools',
        tags: ['hydration'],
        querystring: {
          ...HydrationListPoolsRequestSchema,
          properties: {
            network: { type: 'string', default: 'mainnet' },
            types: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Pool types to filter by'
            },
            maxNumberOfPages: { 
              type: 'integer', 
              default: 1,
              description: 'Maximum number of pages to fetch'
            },
            useOfficialTokens: { 
              type: 'boolean', 
              default: true,
              description: 'Whether to use official token list for resolution'
            },
            tokenSymbols: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Token symbols to filter by'
            },
            tokenAddresses: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Token addresses to filter by'
            }
          }
        },
        response: {
          200: HydrationListPoolsResponseSchema
        }
      }
    },
    async (request, reply) => {
      // Extract parameters with defaults
      const {
        network = 'mainnet',
        types = [],
        maxNumberOfPages = 1,
        useOfficialTokens = true,
      } = request.query;

      // Handle tokenSymbols and tokenAddresses specially to ensure they're properly formatted as arrays
      // This fixes the case when they're passed as multiple query params with the same name
      let tokenSymbols = request.query.tokenSymbols || [];
      let tokenAddresses = request.query.tokenAddresses || [];
      
      // Ensure tokenSymbols is always an array
      if (!Array.isArray(tokenSymbols)) {
        tokenSymbols = [tokenSymbols];
      }
      
      // Ensure tokenAddresses is always an array
      if (!Array.isArray(tokenAddresses)) {
        tokenAddresses = [tokenAddresses];
      }
      
      // Filter out empty strings
      tokenSymbols = tokenSymbols.filter(Boolean);
      tokenAddresses = tokenAddresses.filter(Boolean);

      logger.debug(`Request params: network=${network}, tokenSymbols=${JSON.stringify(tokenSymbols)}, tokenAddresses=${JSON.stringify(tokenAddresses)}`);

      try {
        const result = await listHydrationPools(
          fastify,
          network,
          types,
          tokenSymbols,
          tokenAddresses,
          useOfficialTokens,
          maxNumberOfPages
        );

        return result;
      } catch (error) {
        logger.error('Error in list-pools endpoint:', error);

        if (error.statusCode) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default listPoolsRoute;
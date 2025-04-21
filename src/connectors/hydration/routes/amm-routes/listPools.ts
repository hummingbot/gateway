import {FastifyPluginAsync} from 'fastify';
import {Hydration} from '../../hydration';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../../schemas/trading-types/amm-schema';

/**
 * Extended parameters for listPools endpoint, adding additional filtering options.
 */
interface ExtendedListPoolsRequestType extends ListPoolsRequestType {
  /** Target network to query (defaults to mainnet) */
  network?: string;
  
  /** Array of pool types to filter by (e.g. ['xyz', 'stablepool']) */
  types?: string[];
  
  /** Maximum number of pages to fetch from the API */
  maxNumberOfPages?: number;
  
  /** Whether to use official token list instead of on-chain resolution */
  useOfficialTokens?: boolean;
  
  /** Array of token symbols to filter pools by (e.g. ['USDT', 'DOT']) */
  tokenSymbols?: string[];
  
  /** Array of token addresses to filter pools by */
  tokenAddresses?: string[];
}

/**
 * Route handler for listing all available pools.
 * Supports filtering by token, pool type, and other parameters.
 */
export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: ExtendedListPoolsRequestType;
    Reply: ListPoolsResponseType;
  }>(
    '/list-pools',
    {
      schema: {
        description: 'List all available Hydration pools',
        tags: ['hydration'],
        querystring: {
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            types: {
              type: 'array',
              description: 'Array of pool types to filter by',
              items: { type: 'string' },
              examples: [['xyz', 'stablepool']]
            },
            maxNumberOfPages: { type: 'integer', description: 'Maximum number of pages to fetch', default: 1 },
            useOfficialTokens: { type: 'boolean', description: 'Whether to use official token list instead of on-chain resolution', default: true },
            tokenSymbols: {
              type: 'array',
              description: 'Array of token symbols to filter by',
              items: { type: 'string' },
              examples: [['USDT', 'DOT']]
            },
            tokenAddresses: {
              type: 'array',
              description: 'Array of token addresses to filter by',
              items: { type: 'string' },
              examples: [['10', '5']]
            }
          }
        },
        response: {
          200: ListPoolsResponse
        }
      }
    },
    async (request) => {
      // Extract parameters with defaults
      const {
        network = 'mainnet',
        types = [],
        maxNumberOfPages = 1,
        useOfficialTokens = true,
        tokenSymbols = [],
        tokenAddresses = []
      } = request.query;

      // Get Hydration instance
      const hydration = await Hydration.getInstance(network);
      if (!hydration) {
        throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
      }

      // Use the business logic method from the Hydration class
      const pools = await hydration.listPools(
        types,
        tokenSymbols,
        tokenAddresses,
        useOfficialTokens,
        maxNumberOfPages
      );

      return { pools };
    }
  );
};

export default listPoolsRoute;
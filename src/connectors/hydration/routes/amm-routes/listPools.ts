import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../../schemas/trading-types/amm-schema';
import { BigNumber } from '@galacticcouncil/sdk/build/types/utils/bignumber';
import { PoolBase } from '@galacticcouncil/sdk/build/types/types';

// Extended parameters for listPools
interface ExtendedListPoolsRequestType extends ListPoolsRequestType {
  network?: string;
  types?: string[]; // Array of pool types (e.g. ['xyz', 'stablepool'])
  maxNumberOfPages?: number;
  useOfficialTokens?: boolean;
  tokenSymbols?: string[]; // Array of token symbols (e.g. ['USDT', 'DOT'])
  tokenAddresses?: string[]; // Array of token addresses (e.g. ['10', '22'])
}

/**
 * Route handler for getting all pools
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
      try {
        // Extract parameters
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
      } catch (e) {
        logger.error(`Error listing pools:`, e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default listPoolsRoute;
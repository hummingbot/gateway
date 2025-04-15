import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../../schemas/trading-types/amm-schema';

// Known token symbols to addresses mapping (similar to official tokens list)
const KNOWN_TOKENS = {
  'USDT': '4fCm4ZsGFDx5thKMXUiQMeECwGQRKLnJS6Qb59STKUT9',
  'USDC': '4qVzZ7yJpyLbNZQrHsiZFvxj9NMwAHJrZqkM9gruonH1',  
  'WBNB': '14ChbwdnC5zPzemV2L7wisToAFHBhPwGy1PzQpugCKd7',
  'WETH': '7Xeq4eqxcGJGGsA2HXKKGePdXR4MfXMxvzWYiGP9jFBg',
};

// Extended parameters for listPools
interface ExtendedListPoolsRequestType extends ListPoolsRequestType {
  network?: string;
  tokens?: string[]; // Array of token symbols/addresses (e.g. ['usdt', 'usdc'])
  types?: string[]; // Array of pool types (e.g. ['xyz', 'stablepool'])
  maxNumberOfPages?: number;
  useOfficialTokens?: boolean;
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
            tokens: { 
              type: 'array', 
              description: 'Array of token symbols/addresses to filter by',
              items: { type: 'string' },
              examples: [['usdt', 'usdc']]
            },
            types: { 
              type: 'array', 
              description: 'Array of pool types to filter by',
              items: { type: 'string' },  
              examples: [['xyz', 'stablepool']]
            },
            maxNumberOfPages: { type: 'integer', description: 'Maximum number of pages to fetch', default: 1 },
            useOfficialTokens: { type: 'boolean', description: 'Whether to use official token list instead of on-chain resolution', default: true }
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
          tokens = [],
          types = [],
          maxNumberOfPages = 1,
          useOfficialTokens = true
        } = request.query;
        
        // Use the arrays directly - no need to parse comma-separated strings
        const tokensList = tokens;
        const typesList = types;
        
        logger.info(`Listing Hydration pools on network: ${network}`);
        if (tokensList.length > 0) logger.info(`Filtering by tokens: ${tokensList.join(', ')}`);
        if (typesList.length > 0) logger.info(`Filtering by types: ${typesList.join(', ')}`);
        logger.info(`Max pages: ${maxNumberOfPages}, Use official tokens: ${useOfficialTokens}`);
        
        const hydration = await Hydration.getInstance(network);
        if (!hydration) {
          throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
        }

        try {
          // Resolve token symbols to addresses if using official tokens list
          const resolvedTokenAddresses: string[] = [];
          if (useOfficialTokens && tokensList.length > 0) {
            for (const token of tokensList) {
              const upperToken = token.toUpperCase();
              if (KNOWN_TOKENS[upperToken]) {
                resolvedTokenAddresses.push(KNOWN_TOKENS[upperToken]);
                logger.info(`Resolved token ${token} to address ${KNOWN_TOKENS[upperToken]} using official list`);
              } else {
                // If not found in known tokens, use as is (might be an address)
                resolvedTokenAddresses.push(token);
              }
            }
          }

          // Get all pool addresses with pagination support
          let poolAddresses: string[] = [];
          try {
            // In Hydration, we'll implement pagination by limiting the number of pools processed
            const allPoolAddresses = await hydration.getPoolAddresses();
            const pageSize = 100; // Assume each "page" has 100 pools
            const totalPagesToFetch = Math.min(
              Math.ceil(allPoolAddresses.length / pageSize),
              maxNumberOfPages
            );
            
            // Take only the pools we need based on pagination
            poolAddresses = allPoolAddresses.slice(0, totalPagesToFetch * pageSize);
            
            logger.info(`Using pagination: Found ${allPoolAddresses.length} total pool addresses, processing ${poolAddresses.length} pools (${totalPagesToFetch} pages)`);
          } catch (error) {
            logger.error(`Error getting pool addresses: ${error.message}`);
            throw fastify.httpErrors.internalServerError('Failed to get pool addresses');
          }
          
          // Get pool info for each address with improved error handling
          const poolPromises = poolAddresses.map(async (address) => {
            try {
              return await hydration.getPoolInfo(address);
            } catch (error) {
              logger.warn(`Failed to get pool info for ${address}: ${error.message}`);
              return null;
            }
          });
          
          const pools = (await Promise.all(poolPromises)).filter(Boolean);
          logger.info(`Successfully retrieved info for ${pools.length} pools`);

          // Create a cache for token symbols to avoid duplicate lookups
          const tokenSymbolCache = new Map();
          
          // Helper function to get token symbol with caching and fallbacks
          const getTokenSymbolWithFallback = async (tokenAddress) => {
            if (!tokenAddress) return 'Unknown';
            
            // Check cache first
            if (tokenSymbolCache.has(tokenAddress)) {
              return tokenSymbolCache.get(tokenAddress);
            }
            
            // Check if address matches any resolved token addresses when using official tokens
            if (useOfficialTokens && resolvedTokenAddresses.length > 0) {
              for (const [symbol, address] of Object.entries(KNOWN_TOKENS)) {
                if (address === tokenAddress) {
                  tokenSymbolCache.set(tokenAddress, symbol);
                  return symbol;
                }
              }
            }
            
            try {
              // Try to get symbol from Hydration
              const symbol = await hydration.getTokenSymbol(tokenAddress);
              
              // If we got a valid symbol, cache and return it
              if (symbol && symbol !== '2-Pool' && symbol !== '4-Pool') {
                tokenSymbolCache.set(tokenAddress, symbol);
                return symbol;
              }
              
              // If we have an address but no valid symbol, use shortened address
              const shortAddress = `${tokenAddress.substring(0, 4)}...${tokenAddress.substring(tokenAddress.length - 4)}`;
              tokenSymbolCache.set(tokenAddress, shortAddress);
              return shortAddress;
            } catch (error) {
              logger.warn(`Failed to get token symbol for ${tokenAddress}: ${error.message}`);
              const shortAddress = `${tokenAddress.substring(0, 4)}...${tokenAddress.substring(tokenAddress.length - 4)}`;
              tokenSymbolCache.set(tokenAddress, shortAddress);
              return shortAddress;
            }
          };

          // Filter by token addresses first if we resolved them
          let filteredPools = [...pools];
          if (useOfficialTokens && resolvedTokenAddresses.length > 0) {
            const beforeCount = filteredPools.length;
            filteredPools = filteredPools.filter(pool => 
              resolvedTokenAddresses.some(tokenAddr => 
                pool.baseTokenAddress === tokenAddr || pool.quoteTokenAddress === tokenAddr
              )
            );
            logger.info(`Token address filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          
          // Filter by pool type if specified
          if (typesList.length > 0) {
            const beforeCount = filteredPools.length;
            filteredPools = filteredPools.filter(pool => 
              pool.poolType && typesList.some(type => 
                pool.poolType.toLowerCase().includes(type.toLowerCase())
              )
            );
            logger.info(`Pool type filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          
          // Map pools to response format and process token filters
          const poolListPromises = filteredPools.map(async pool => {
            const baseTokenSymbol = await getTokenSymbolWithFallback(pool.baseTokenAddress);
            const quoteTokenSymbol = await getTokenSymbolWithFallback(pool.quoteTokenAddress);
            
            // Create pool object
            return {
              address: pool.address,
              type: pool.poolType || 'hydration',
              tokens: [baseTokenSymbol, quoteTokenSymbol],
              fee: pool.feePct
            };
          });
          
          // Wait for all pool info to be processed
          let poolList = await Promise.all(poolListPromises);
          
          // Apply token symbol filter if tokens are specified and we're not using official tokens
          // (if we're using official tokens, we've already filtered by address above)
          if (tokensList.length > 0 && !useOfficialTokens) {
            const beforeCount = poolList.length;
            poolList = poolList.filter(pool => 
              tokensList.some(token => 
                // Check if any of the pool tokens match the requested token
                pool.tokens.some(poolToken => 
                  poolToken.toLowerCase().includes(token.toLowerCase())
                )
              )
            );
            logger.info(`Token symbol filter: ${beforeCount} → ${poolList.length} pools`);
          }
          
          // Log results
          logger.info(`Final result: ${poolList.length} pools after all filters`);
          
          return { pools: poolList };
        } catch (e) {
          logger.error(`Error listing pools:`, e);
          throw fastify.httpErrors.internalServerError('Internal server error');
        }
      } catch (e) {
        logger.error(`Error listing pools:`, e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default listPoolsRoute;

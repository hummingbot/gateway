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
        
        // Make sure arrays are properly handled
        const tokenSymbolsArray = Array.isArray(tokenSymbols) ? tokenSymbols : [tokenSymbols].filter(Boolean);
        const tokenAddressesArray = Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses].filter(Boolean);
        const typesArray = Array.isArray(types) ? types : [types].filter(Boolean);
        
        // Determine if we need to fetch by token
        const hasTokenSymbols = tokenSymbolsArray.length > 0;
        const hasTokenAddresses = tokenAddressesArray.length > 0;
        const hasTokens = hasTokenSymbols || hasTokenAddresses;
        
        // Store if we need to filter by both symbol and address
        const needsSymbolAndAddressMatch = hasTokenSymbols && hasTokenAddresses;
        
        // Log what we're filtering for
        const logMessage = [`Listing Hydration pools on network: ${network}`];
        if (tokenSymbolsArray.length > 0) logMessage.push(`Token symbols: ${tokenSymbolsArray.join(', ')}`);
        if (tokenAddressesArray.length > 0) logMessage.push(`Token addresses: ${tokenAddressesArray.join(', ')}`);
        if (typesArray.length > 0) logMessage.push(`Pool types: ${typesArray.join(', ')}`);
        logMessage.push(`Max pages: ${maxNumberOfPages}`);
        logMessage.push(`Use official tokens: ${useOfficialTokens}`);
        if (needsSymbolAndAddressMatch) logMessage.push(`Requiring both symbol AND address match`);
        logger.info(logMessage.join(', '));
        
        const hydration = await Hydration.getInstance(network);
        if (!hydration) {
          throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
        }

        try {
          // Resolve token symbols to addresses if using official tokens list
          const resolvedTokenAddresses: string[] = [];
          const allAddressesToFilterBy: string[] = [...tokenAddressesArray]; // Start with explicit addresses
          
          // Process token lists - we'll gather all addresses to filter by
          if (useOfficialTokens && hasTokenSymbols) {
            // Create a function to resolve symbols
            const resolveSymbolsToAddresses = (symbols: string[]) => {
              const resolved: string[] = [];
              
              for (const token of symbols) {
                const upperToken = token.toUpperCase();
                if (KNOWN_TOKENS[upperToken]) {
                  const resolvedAddress = KNOWN_TOKENS[upperToken];
                  resolved.push(resolvedAddress);
                  logger.info(`Resolved token ${token} to address ${resolvedAddress} using official list`);
                }
              }
              
              return resolved;
            };
            
            // Process specific token symbols parameter
            if (hasTokenSymbols) {
              const resolvedFromSymbols = resolveSymbolsToAddresses(tokenSymbolsArray);
              resolvedTokenAddresses.push(...resolvedFromSymbols);
              
              // Only add to filter list if we don't need both symbol AND address match
              if (!needsSymbolAndAddressMatch) {
                allAddressesToFilterBy.push(...resolvedFromSymbols);
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
            if (useOfficialTokens) {
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

          // Filter processing
          let filteredPools = [...pools]; // Make a copy
          
          // Advanced filtering: Symbols and Addresses
          if (needsSymbolAndAddressMatch) {
            logger.info(`Applying specific symbol AND address matching filter`);
            const beforeCount = filteredPools.length;
            
            // Filter by addresses and then check if the symbols match
            filteredPools = filteredPools.filter(pool => 
              tokenAddressesArray.some(addr => 
                pool.baseTokenAddress === addr || pool.quoteTokenAddress === addr
              )
            );
            
            logger.info(`Symbol AND address filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          // Standard filtering by individual parameters
          else if (hasTokens) {
            // Filter by token addresses
            const beforeCount = filteredPools.length;
            
            filteredPools = filteredPools.filter(pool => 
              allAddressesToFilterBy.some(addr => 
                pool.baseTokenAddress === addr || pool.quoteTokenAddress === addr
              )
            );
            
            logger.info(`Token address filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          
          // Filter by pool type if specified
          if (typesArray.length > 0) {
            const beforeCount = filteredPools.length;
            filteredPools = filteredPools.filter(pool => 
              pool.poolType && typesArray.some(type => 
                pool.poolType.toLowerCase().includes(type.toLowerCase())
              )
            );
            logger.info(`Pool type filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          
          // Map pools to response format and process token filters
          const poolListPromises = filteredPools.map(async pool => {
            const baseTokenSymbol = await getTokenSymbolWithFallback(pool.baseTokenAddress);
            const quoteTokenSymbol = await getTokenSymbolWithFallback(pool.quoteTokenAddress);
            
            // Calculate additional metrics from available properties
            const volume24h = 0; // We don't have volume data in ExternalPoolInfo
            const tvl = pool.baseTokenAmount * pool.price + pool.quoteTokenAmount || 0;
            const apr = 0; // We don't have APR data in ExternalPoolInfo
            
            // Create pool object with extended information
            return {
              address: pool.address,
              type: pool.poolType || 'hydration',
              tokens: [baseTokenSymbol, quoteTokenSymbol],
              tokenAddresses: [pool.baseTokenAddress, pool.quoteTokenAddress],
              fee: pool.feePct,
              price: pool.price || 0,
              volume: volume24h,
              tvl: tvl,
              apr: apr
            };
          });
          
          // Wait for all pool info to be processed
          let poolList = await Promise.all(poolListPromises);
          
          // Apply token symbol filter if token symbols are specified and we're not using official tokens
          // (if we're using official tokens, we've already filtered by address above)
          if (hasTokenSymbols && !useOfficialTokens) {
            const beforeCount = poolList.length;
            
            poolList = poolList.filter(pool => 
              tokenSymbolsArray.some(token => 
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

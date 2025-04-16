import { FastifyPluginAsync } from 'fastify';
import { Raydium } from '../raydium';
import { logger } from '../../../services/logger';
import { isValidAmm, isValidCpmm, isValidClmm } from '../raydium.utils';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../schemas/trading-types/amm-schema';
import { PublicKey } from '@solana/web3.js';

// Known token mint addresses for quick access
const KNOWN_TOKEN_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  SOL: 'So11111111111111111111111111111111111111112',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

// Extended parameters for listPools
interface ExtendedListPoolsRequestType extends ListPoolsRequestType {
  network?: string;
  tokens?: string[]; // Array of token symbols/addresses for backwards compatibility
  types?: string[]; // Array of pool types (e.g. ['amm', 'cpmm', 'clmm'])
  maxNumberOfPages?: number;
  useOfficialTokens?: boolean;
  
  // New specific token parameters
  tokenSymbols?: string[]; // Array of token symbols (e.g. ['USDC', 'USDT'])
  tokenAddresses?: string[]; // Array of token addresses (e.g. ['EPjFWdd5...', 'Es9vMFrz...'])
}

/**
 * Route handler for getting Raydium pools
 */
export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: ExtendedListPoolsRequestType;
    Reply: ListPoolsResponseType;
  }>(
    '/list-pools',
    {
      schema: {
        description: 'List available Raydium pools',
        tags: ['raydium-amm'],
        querystring: {
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            tokens: { 
              type: 'array', 
              description: 'Array of token symbols/addresses to filter by (for backward compatibility)',
              items: { type: 'string' },
              examples: [['usdt', 'usdc']]
            },
            types: { 
              type: 'array', 
              description: 'Array of pool types to filter by',
              items: { type: 'string' },
              examples: [['amm', 'cpmm', 'clmm']]
            },
            maxNumberOfPages: { 
              type: 'integer', 
              description: 'Maximum number of pages to fetch (1000 pools per page)', 
              default: 3 
            },
            useOfficialTokens: { 
              type: 'boolean', 
              description: 'Use official token list instead of Jupiter token list', 
              default: true 
            },
            tokenSymbols: { 
              type: 'array', 
              description: 'Array of token symbols to filter by',
              items: { type: 'string' },
              examples: [['USDT', 'USDC']]
            },
            tokenAddresses: { 
              type: 'array', 
              description: 'Array of token addresses to filter by',
              items: { type: 'string' },
              examples: [[KNOWN_TOKEN_MINTS.USDT, KNOWN_TOKEN_MINTS.USDC]]
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
          network = 'mainnet-beta',
          tokens = [],
          types = [],
          maxNumberOfPages = 3,
          useOfficialTokens = false,
          tokenSymbols = [],
          tokenAddresses = []
        } = request.query;
        
        // Use arrays directly - no need to split strings
        const tokensList = tokens;
        const typesList = types;
        
        // Determine if we need to fetch by token
        const hasTokenSymbols = tokenSymbols.length > 0;
        const hasTokenAddresses = tokenAddresses.length > 0;
        const hasTokens = tokensList.length > 0 || hasTokenSymbols || hasTokenAddresses;
        
        // Store if we need to filter by both symbol and address
        const needsSymbolAndAddressMatch = hasTokenSymbols && hasTokenAddresses;
        
        // Determine Jupiter token list usage
        const useJupiterTokens = !useOfficialTokens;
        
        // Log what we're filtering for
        const logMessage = [`Listing Raydium pools on network: ${network}`];
        if (tokensList.length > 0) logMessage.push(`General tokens: ${tokensList.join(', ')}`);
        if (tokenSymbols.length > 0) logMessage.push(`Token symbols: ${tokenSymbols.join(', ')}`);
        if (tokenAddresses.length > 0) logMessage.push(`Token addresses: ${tokenAddresses.join(', ')}`);
        if (typesList.length > 0) logMessage.push(`Pool types: ${typesList.join(', ')}`);
        logMessage.push(`Max pages: ${maxNumberOfPages}`);
        logMessage.push(`Use Jupiter tokens: ${useJupiterTokens}`);
        if (needsSymbolAndAddressMatch) logMessage.push(`Requiring both symbol AND address match`);
        logger.info(logMessage.join(', '));
        
        // Get the singleton Raydium instance for the network
        const raydium = await Raydium.getInstance(network);
        if (!raydium) {
          throw fastify.httpErrors.serviceUnavailable('Raydium service unavailable');
        }
        
        // Container for all pools and related data
        let allPools = [];
        let jupTokenList = [];
        let symbolToMintMap = {};
        
        // Resolved addresses from symbols for filtering
        const resolvedAddressesFromSymbols: string[] = [];
        
        // Process token lists - we'll gather all addresses to filter by
        const allAddressesToFilterBy: string[] = [...tokenAddresses]; // Start with explicit addresses
        
        // If we have symbols to filter by, resolve them to addresses
        if (hasTokenSymbols || (tokensList.length > 0 && useJupiterTokens)) {
          try {
            logger.info(`Fetching Jupiter token list for token resolution`);
            jupTokenList = await raydium.raydiumSDK.api.getJupTokenList();
            
            // Create a map of symbols to mint addresses
            symbolToMintMap = jupTokenList.reduce((map, token) => {
              map[token.symbol.toUpperCase()] = token.address;
              return map;
            }, {});
            
            logger.info(`Retrieved ${jupTokenList.length} tokens from Jupiter token list`);
            
            // Resolve token symbols to addresses
            const resolveSymbolsToAddresses = (symbols: string[]) => {
              const resolvedAddresses: string[] = [];
              
              for (const symbol of symbols) {
                const upperSymbol = symbol.toUpperCase();
                // Try Jupiter token list first
                if (symbolToMintMap[upperSymbol]) {
                  const resolvedAddress = symbolToMintMap[upperSymbol];
                  resolvedAddresses.push(resolvedAddress);
                  logger.info(`Resolved symbol ${symbol} to address ${resolvedAddress}`);
                } 
                // Then check known tokens
                else if (KNOWN_TOKEN_MINTS[upperSymbol]) {
                  const resolvedAddress = KNOWN_TOKEN_MINTS[upperSymbol];
                  resolvedAddresses.push(resolvedAddress);
                  logger.info(`Resolved symbol ${symbol} to address ${resolvedAddress} using KNOWN_TOKEN_MINTS`);
                }
              }
              
              return resolvedAddresses;
            };
            
            // Process specific token symbols parameter
            if (hasTokenSymbols) {
              const resolvedFromSpecificSymbols = resolveSymbolsToAddresses(tokenSymbols);
              resolvedAddressesFromSymbols.push(...resolvedFromSpecificSymbols);
              
              // Only add to filter list if we don't need both symbol AND address match
              if (!needsSymbolAndAddressMatch) {
                allAddressesToFilterBy.push(...resolvedFromSpecificSymbols);
              }
            }
            
            // Process general tokens parameter for symbols
            if (tokensList.length > 0) {
              // For the general tokens parameter, we'll treat everything as potential symbols and addresses
              const resolvedFromGeneralTokens = resolveSymbolsToAddresses(tokensList);
              allAddressesToFilterBy.push(...resolvedFromGeneralTokens);
              
              // Also add the original tokens as potential addresses
              tokensList.forEach(token => {
                if (token.length >= 32) { // Likely an address
                  try {
                    new PublicKey(token); // Validate it's a public key
                    allAddressesToFilterBy.push(token);
                  } catch (e) {
                    // Not a valid address, skip
                  }
                }
              });
            }
          } catch (error) {
            logger.error(`Error fetching/processing Jupiter token list: ${error.message}`);
          }
        } else if (tokensList.length > 0) {
          // If not using Jupiter but have tokens, assume they might be addresses
          tokensList.forEach(token => {
            if (token.length >= 32) { // Likely an address
              try {
                new PublicKey(token); // Validate it's a public key
                allAddressesToFilterBy.push(token);
              } catch (e) {
                // Not a valid address, skip
              }
            }
          });
        }
        
        // Log the resolved addresses for debugging
        logger.info(`Resolved addresses to filter by: ${allAddressesToFilterBy.join(', ') || 'none'}`);
        
        // Method 1: Use fetchPoolByMints if we have addresses to filter by
        if (allAddressesToFilterBy.length > 0) {
          // Convert addresses to PublicKeys for querying
          const validPublicKeys: PublicKey[] = [];
          
          for (const address of allAddressesToFilterBy) {
            try {
              validPublicKeys.push(new PublicKey(address));
            } catch (error) {
              logger.warn(`Invalid public key ${address}: ${error.message}`);
            }
          }
          
          // If we have valid keys, query by pairs
          if (validPublicKeys.length > 0) {
            logger.info(`Using fetchPoolByMints with ${validPublicKeys.length} valid public keys`);
            
            try {
              // If we have multiple keys, we need to fetch pools for each pair
              if (validPublicKeys.length >= 2) {
                // We'll fetch pools for each combination of two tokens
                const poolPromises = [];
                
                // If checking for specific pairs
                if (needsSymbolAndAddressMatch) {
                  logger.info(`Fetching pools with specific symbol-address combinations`);
                  
                  // Get the valid public keys for addresses specifically provided
                  const addressPublicKeys: PublicKey[] = [];
                  for (const address of tokenAddresses) {
                    try {
                      addressPublicKeys.push(new PublicKey(address));
                    } catch (error) {
                      logger.warn(`Invalid token address ${address}: ${error.message}`);
                    }
                  }
                  
                  // Get the valid public keys for resolved symbols
                  const symbolPublicKeys: PublicKey[] = [];
                  for (const address of resolvedAddressesFromSymbols) {
                    try {
                      symbolPublicKeys.push(new PublicKey(address));
                    } catch (error) {
                      logger.warn(`Invalid resolved address ${address}: ${error.message}`);
                    }
                  }
                  
                  // Fetch pools for combinations of address and symbol
                  for (const addrKey of addressPublicKeys) {
                    for (const symKey of symbolPublicKeys) {
                      poolPromises.push(
                        raydium.raydiumSDK.api.fetchPoolByMints({
                          mint1: addrKey,
                          mint2: symKey,
                          page: 1,
                          order: 'desc',
                          sort: 'liquidity'
                        }).catch(error => {
                          logger.warn(`Error fetching pools for ${addrKey.toString()} and ${symKey.toString()}: ${error.message}`);
                          return { data: [] };
                        })
                      );
                    }
                  }
                }
                // Otherwise check for pools with any combination of tokens
                else {
                  // Fetch pools for all combinations of tokens (without duplicates)
                  for (let i = 0; i < validPublicKeys.length; i++) {
                    for (let j = i + 1; j < validPublicKeys.length; j++) {
                      poolPromises.push(
                        raydium.raydiumSDK.api.fetchPoolByMints({
                          mint1: validPublicKeys[i],
                          mint2: validPublicKeys[j],
                          page: 1,
                          order: 'desc',
                          sort: 'liquidity'
                        }).catch(error => {
                          logger.warn(`Error fetching pools for ${validPublicKeys[i].toString()} and ${validPublicKeys[j].toString()}: ${error.message}`);
                          return { data: [] };
                        })
                      );
                    }
                  }
                }
                
                // Execute all promises
                const poolResponses = await Promise.all(poolPromises);
                
                // Combine all results, removing duplicates
                const poolMap = new Map(); // Use Map to remove duplicates by ID
                for (const response of poolResponses) {
                  for (const pool of response.data) {
                    if (pool.id) {
                      poolMap.set(pool.id, pool);
                    }
                  }
                }
                
                allPools = Array.from(poolMap.values());
                logger.info(`Retrieved ${allPools.length} unique pools from ${poolPromises.length} pair queries`);
              }
              // If we have just one key, fetch all pools for this token
              else {
                const poolsResponse = await raydium.raydiumSDK.api.fetchPoolByMints({
                  mint1: validPublicKeys[0],
                  page: 1,
                  order: 'desc',
                  sort: 'liquidity'
                });
                
                allPools = poolsResponse.data;
                logger.info(`Retrieved ${allPools.length} pools containing token ${validPublicKeys[0].toString()}`);
              }
            } catch (error) {
              logger.error(`Error fetching pools by mints: ${error.message}`);
            }
          }
        }
        
        // Method 2: If token-based fetch had no results, or no tokens were specified
        if (allPools.length === 0) {
          logger.info(`Fetching all pools with pagination (fallback method)`);
          allPools = await raydium.getAllPoolsFromAPI(maxNumberOfPages);
          logger.info(`Retrieved ${allPools.length} pools using getAllPoolsFromAPI`);
        }
        
        // Filter processing
        let filteredPools = [...allPools]; // Make a copy
        
        // Advanced filtering: Symbols and Addresses
        if (needsSymbolAndAddressMatch) {
          logger.info(`Applying specific symbol AND address matching filter`);
          const beforeCount = filteredPools.length;
          
          // We need pools that have both the tokenSymbols and tokenAddresses
          filteredPools = filteredPools.filter(poolInfo => {
            // Get information from the pool
            const mintAAddress = poolInfo.mintA?.address || '';
            const mintBAddress = poolInfo.mintB?.address || '';
            const symbolA = poolInfo.mintA?.symbol || '';
            const symbolB = poolInfo.mintB?.symbol || '';
            
            // Check if the pool has tokens matching both a specified address AND a specified symbol
            const hasMatchingAddress = tokenAddresses.some(addr => 
              mintAAddress === addr || mintBAddress === addr
            );
            
            const hasMatchingSymbol = tokenSymbols.some(sym => {
              const upperSym = sym.toUpperCase();
              return symbolA.toUpperCase() === upperSym || symbolB.toUpperCase() === upperSym;
            });
            
            return hasMatchingAddress && hasMatchingSymbol;
          });
          
          logger.info(`Symbol AND address filter: ${beforeCount} → ${filteredPools.length} pools`);
        }
        // Standard filtering by individual parameters
        else {
          // Filter by token addresses if specified
          if (tokenAddresses.length > 0 || (tokensList.length > 0 && !hasTokenSymbols)) {
            const beforeCount = filteredPools.length;
            
            filteredPools = filteredPools.filter(poolInfo => {
              const mintAAddress = poolInfo.mintA?.address || '';
              const mintBAddress = poolInfo.mintB?.address || '';
              
              return allAddressesToFilterBy.some(addr => 
                mintAAddress === addr || mintBAddress === addr
              );
            });
            
            logger.info(`Token address filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          
          // Filter by token symbols if specified
          if (tokenSymbols.length > 0 && jupTokenList.length > 0) {
            const beforeCount = filteredPools.length;
            
            filteredPools = filteredPools.filter(poolInfo => {
              // Get symbols for the pool tokens
              const tokenASymbol = poolInfo.mintA?.symbol || '';
              const tokenBSymbol = poolInfo.mintB?.symbol || '';
              
              // Check if any requested symbol matches
              return tokenSymbols.some(symbol => {
                const upperSymbol = symbol.toUpperCase();
                return tokenASymbol.toUpperCase() === upperSymbol || 
                       tokenBSymbol.toUpperCase() === upperSymbol;
              });
            });
            
            logger.info(`Token symbol filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          
          // Filter by general tokens list if specified and we haven't already used it
          if (tokensList.length > 0 && !hasTokenSymbols && !hasTokenAddresses) {
            const beforeCount = filteredPools.length;
            
            filteredPools = filteredPools.filter(poolInfo => {
              // Get symbols and addresses for the pool tokens
              const mintAAddress = poolInfo.mintA?.address || '';
              const mintBAddress = poolInfo.mintB?.address || '';
              const tokenASymbol = poolInfo.mintA?.symbol || '';
              const tokenBSymbol = poolInfo.mintB?.symbol || '';
              
              // Check if any token matches by symbol or address
              return tokensList.some(token => {
                const upperToken = token.toUpperCase();
                return tokenASymbol.toUpperCase().includes(upperToken) || 
                       tokenBSymbol.toUpperCase().includes(upperToken) ||
                       mintAAddress === token ||
                       mintBAddress === token;
              });
            });
            
            logger.info(`General token filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
        }
        
        // Filter by pool type if specified
        if (typesList.length > 0) {
          const beforeCount = filteredPools.length;
          
          filteredPools = filteredPools.filter(poolInfo => {
            // First check by type property
            if (poolInfo.type && typesList.some(type => 
              poolInfo.type.toLowerCase() === type.toLowerCase())) {
              return true;
            }
            
            // Then check by program ID
            const programIdStr = typeof poolInfo.programId === 'string' 
              ? poolInfo.programId 
              : poolInfo.programId?.toString() || '';
            
            return typesList.some(type => {
              if (type.toLowerCase() === 'amm' && isValidAmm(programIdStr)) {
                return true;
              } else if (type.toLowerCase() === 'cpmm' && isValidCpmm(programIdStr)) {
                return true;
              } else if (type.toLowerCase() === 'clmm' && isValidClmm(programIdStr)) {
                return true;
              }
              return false;
            });
          });
          
          logger.info(`Pool type filter: ${beforeCount} → ${filteredPools.length} pools`);
        }
        
        logger.info(`Final result: ${filteredPools.length} pools after all filters`);
        
        // Map the pool info to response format
        const pools = filteredPools.map((poolInfo) => {
          let poolType = 'unknown';
          const programIdStr = typeof poolInfo.programId === 'string' 
            ? poolInfo.programId 
            : poolInfo.programId?.toString() || '';
            
          if (isValidAmm(programIdStr)) {
            poolType = 'amm';
          } else if (isValidCpmm(programIdStr)) {
            poolType = 'cpmm';
          } else if (isValidClmm(programIdStr)) {
            poolType = 'clmm';
          }

          return {
            address: poolInfo.id || poolInfo.ammId || poolInfo.address || '',
            type: poolType,
            tokens: [
              poolInfo.mintA?.symbol || poolInfo.tokenASymbol || 'Unknown',
              poolInfo.mintB?.symbol || poolInfo.tokenBSymbol || 'Unknown'
            ],
            price: poolInfo.price,
            tvl: 'liquidity' in poolInfo ? poolInfo.liquidity : undefined,
            fee: poolInfo.feeRate || poolInfo.fee || 0
          };
        });

        return { pools };
      } catch (error) {
        logger.error(`Error listing Raydium pools:`, error);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );

  // Keep the stablecoin pools route unchanged
  fastify.get('/find-stablecoin-pools', {
    schema: {
      description: 'Find the best USDC/USDT pools sorted by TVL',
      tags: ['raydium-amm'],
      querystring: {
        properties: {
          network: { type: 'string', examples: ['mainnet-beta'] },
          limit: { type: 'integer', description: 'Maximum number of pools to return', default: 5 }
        }
      }
    },
    handler: async (request) => {
      try {
        const { network = 'mainnet-beta', limit = 5 } = request.query as { network?: string, limit?: number };
        
        logger.info(`Finding best USDC/USDT pools on network: ${network}`);
        
        const raydium = await Raydium.getInstance(network);
        if (!raydium) {
          throw fastify.httpErrors.serviceUnavailable('Raydium service unavailable');
        }
        
        // Use the fetchPoolByMints method directly for best results
        const usdcMint = new PublicKey(KNOWN_TOKEN_MINTS.USDC);
        const usdtMint = new PublicKey(KNOWN_TOKEN_MINTS.USDT);
        
        const poolsResponse = await raydium.raydiumSDK.api.fetchPoolByMints({
          mint1: usdcMint,
          mint2: usdtMint,
          page: 1,
          order: 'desc',
          sort: 'liquidity'
        });
        
        const pools = poolsResponse.data.slice(0, limit).map((poolInfo) => {
          let poolType = 'Unknown';
          if (isValidAmm(poolInfo.programId)) {
            poolType = 'amm';
          } else if (isValidCpmm(poolInfo.programId)) {
            poolType = 'cpmm';
          } else if (isValidClmm(poolInfo.programId)) {
            poolType = 'clmm';
          }

          return {
            address: poolInfo.id,
            type: poolType,
            tokens: [
              poolInfo.mintA?.symbol || poolInfo.mintA?.address,
              poolInfo.mintB?.symbol || poolInfo.mintB?.address
            ],
            price: poolInfo.price,
            tvl: 'liquidity' in poolInfo ? poolInfo.liquidity : undefined,
            fee: poolInfo.feeRate
          };
        });
        
        return { pools };
      } catch (error) {
        logger.error(`Error finding stablecoin pools:`, error);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  });
};

export default listPoolsRoute;

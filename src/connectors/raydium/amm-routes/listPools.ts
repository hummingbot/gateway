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

// Update the request type to include our new parameters
interface ExtendedListPoolsRequestType extends ListPoolsRequestType {
  baseToken?: string;
  quoteToken?: string;
  baseMintToken?: string;
  quoteMintToken?: string;
  poolType?: 'amm' | 'clmm' | 'cpmm' | string;
  maxPages?: number;
  useJupTokens?: boolean;
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
              baseToken: { type: 'string', description: 'Filter by base token symbol', examples: ['USDC'] },
              quoteToken: { type: 'string', description: 'Filter by quote token symbol', examples: ['USDT'] },
              baseMintToken: { type: 'string', description: 'Filter pools by base token mint address', examples: [KNOWN_TOKEN_MINTS.USDC] },
              quoteMintToken: { type: 'string', description: 'Filter pools by quote token mint address', examples: [KNOWN_TOKEN_MINTS.USDT] },
              poolType: { type: 'string', description: 'Filter by pool type (amm, clmm, cpmm)', examples: ['amm'] },
              maxPages: { type: 'integer', description: 'Maximum number of pages to fetch (1000 pools per page)', default: 3 },
              useJupTokens: { type: 'boolean', description: 'Use Jupiter token list for filtering (recommended)', default: true }
            }
          },
          response: {
            200: ListPoolsResponse
          }
        }
      },
      async (request) => {
        try {
          const { 
            network = 'mainnet-beta', 
            baseToken, 
            quoteToken, 
            baseMintToken,
            quoteMintToken,
            poolType,
            maxPages = 3,
            useJupTokens = true // Default to true for better accuracy
          } = request.query;
          
          // Log what we're filtering for
          const logMessage = [`Listing Raydium pools on network: ${network}`];
          if (baseToken) logMessage.push(`baseToken: ${baseToken}`);
          if (quoteToken) logMessage.push(`quoteToken: ${quoteToken}`);
          if (baseMintToken) logMessage.push(`baseMintToken: ${baseMintToken}`);
          if (quoteMintToken) logMessage.push(`quoteMintToken: ${quoteMintToken}`);
          if (poolType) logMessage.push(`poolType: ${poolType}`);
          if (!useJupTokens) logMessage.push(`useJupTokens: false`);
          logger.info(logMessage.join(', '));

          // Get the singleton Raydium instance for the network.
          const raydium = await Raydium.getInstance(network);
          if (!raydium) {
            throw fastify.httpErrors.serviceUnavailable('Raydium service unavailable');
          }

          let allPools = [];
          
          // Get the Jupiter token list first if needed
          let jupTokenList = [];
          let symbolToMintMap = {};
          
          // Get resolved mint addresses from inputs
          let resolvedBaseMint = baseMintToken;
          let resolvedQuoteMint = quoteMintToken;
          
          if (useJupTokens && (baseToken || quoteToken)) {
            try {
              logger.info(`Fetching Jupiter token list for token resolution`);
              jupTokenList = await raydium.raydiumSDK.api.getJupTokenList();
              
              // Create a map of symbols to mint addresses
              symbolToMintMap = jupTokenList.reduce((map, token) => {
                map[token.symbol.toUpperCase()] = token.address;
                return map;
              }, {});
              
              logger.info(`Retrieved ${jupTokenList.length} tokens from Jupiter token list`);
              
              // Resolve token symbols to mint addresses if provided
              if (baseToken && symbolToMintMap[baseToken.toUpperCase()]) {
                resolvedBaseMint = symbolToMintMap[baseToken.toUpperCase()];
                logger.info(`Resolved base token ${baseToken} to mint ${resolvedBaseMint}`);
              }
              
              if (quoteToken && symbolToMintMap[quoteToken.toUpperCase()]) {
                resolvedQuoteMint = symbolToMintMap[quoteToken.toUpperCase()];
                logger.info(`Resolved quote token ${quoteToken} to mint ${resolvedQuoteMint}`);
              }
            } catch (error) {
              logger.error(`Error fetching Jupiter token list: ${error.message}`);
            }
          } else {
            // If not using Jupiter token list but symbols were provided, use them directly
            resolvedBaseMint = baseToken || baseMintToken;
            resolvedQuoteMint = quoteToken || quoteMintToken;
          }
          
          // Log the resolved mint addresses for debugging
          logger.info(`Final resolved mints - Base: ${resolvedBaseMint || 'none'}, Quote: ${resolvedQuoteMint || 'none'}`);

          // Method 1: Use fetchPoolByMints if mint addresses are resolved
          if (resolvedBaseMint || resolvedQuoteMint) {
            logger.info(`Using fetchPoolByMints with resolved tokens`);
            
            try {
              // Convert to PublicKey if needed
              let mint1Key, mint2Key;
              
              try {
                if (resolvedBaseMint) {
                  mint1Key = new PublicKey(resolvedBaseMint);
                  logger.info(`Converted base mint to PublicKey: ${mint1Key.toString()}`);
                }
                
                if (resolvedQuoteMint) {
                  mint2Key = new PublicKey(resolvedQuoteMint);
                  logger.info(`Converted quote mint to PublicKey: ${mint2Key.toString()}`);
                }
              } catch (error) {
                logger.error(`Error creating PublicKey: ${error.message}`);
              }
              
              // We need at least one valid mint key to proceed
              if (mint1Key || mint2Key) {
                const poolsResponse = await raydium.raydiumSDK.api.fetchPoolByMints({
                  mint1: mint1Key || mint2Key, // If only one is available, use it
                  mint2: mint1Key && mint2Key ? mint2Key : undefined,
                  page: 1,
                  order: 'desc',
                  sort: 'liquidity'
                });
                
                allPools = poolsResponse.data;
                logger.info(`Found ${allPools.length} pools using fetchPoolByMints`);
              } else {
                logger.warn("No valid mint addresses could be resolved, using fallback method");
              }
            } catch (error) {
              logger.error(`Error fetching pools by mints: ${error.message}`);
              // Continue with standard fetching if mint-based fetching fails
            }
          }
          
          // Method 2: If mint-based fetch had no results, or no mints were provided
          if (allPools.length === 0) {
            logger.info(`Fetching all pools with pagination (fallback method)`);
            allPools = await raydium.getAllPoolsFromAPI(maxPages);
            logger.info(`Retrieved ${allPools.length} pools using getAllPoolsFromAPI`);
          }
          
          // Now apply all filters
          let filteredPools = [...allPools]; // Make a copy
          
          // Filter by mint addresses if they were resolved
          if (resolvedBaseMint || resolvedQuoteMint) {
            const beforeCount = filteredPools.length;
            
            filteredPools = filteredPools.filter(poolInfo => {
              const mintAAddress = poolInfo.mintA?.address || '';
              const mintBAddress = poolInfo.mintB?.address || '';
              
              const baseMatches = !resolvedBaseMint || 
                mintAAddress === resolvedBaseMint || 
                mintBAddress === resolvedBaseMint;
                
              const quoteMatches = !resolvedQuoteMint || 
                mintAAddress === resolvedQuoteMint || 
                mintBAddress === resolvedQuoteMint;
              
              return baseMatches && quoteMatches;
            });
            
            logger.info(`Mint filter: ${beforeCount} → ${filteredPools.length} pools (${beforeCount - filteredPools.length} removed)`);
          }
          
          // Filter by pool type if specified
          if (poolType) {
            const beforeCount = filteredPools.length;
            
            filteredPools = filteredPools.filter(poolInfo => {
              // First check by type property
              if (poolInfo.type && poolInfo.type.toLowerCase() === poolType.toLowerCase()) {
                return true;
              }
              
              // Then check by program ID
              const programIdStr = typeof poolInfo.programId === 'string' 
                ? poolInfo.programId 
                : poolInfo.programId?.toString() || '';
              
              if (poolType.toLowerCase() === 'amm' && isValidAmm(programIdStr)) {
                return true;
              } else if (poolType.toLowerCase() === 'cpmm' && isValidCpmm(programIdStr)) {
                return true;
              } else if (poolType.toLowerCase() === 'clmm' && isValidClmm(programIdStr)) {
                return true;
              }
              
              return false;
            });
            
            logger.info(`Pool type filter (${poolType}): ${beforeCount} → ${filteredPools.length} pools (${beforeCount - filteredPools.length} removed)`);
          }
          
          logger.info(`Final result: ${filteredPools.length} pools after all filters`);
          
          // Log sample data for the first pool (if available) to help with debugging
          if (filteredPools.length > 0) {
            logger.debug(`First pool in results: ${JSON.stringify({
              id: filteredPools[0].id,
              type: filteredPools[0].type,
              mintA: filteredPools[0].mintA?.address,
              mintB: filteredPools[0].mintB?.address,
              programId: typeof filteredPools[0].programId === 'string' 
                ? filteredPools[0].programId 
                : filteredPools[0].programId?.toString()
            })}`);
          }

          // Map the pool info to your desired output format
          const pools = filteredPools.map((poolInfo) => {
            let poolType = 'Unknown';
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
              address: poolInfo.id,
              type: poolType,
              tokens: [
                poolInfo.mintA?.symbol || poolInfo.mintA?.address,
                poolInfo.mintB?.symbol || poolInfo.mintB?.address
              ],
              price: poolInfo.price,
              tvl: 'liquidity' in poolInfo ? poolInfo.liquidity : undefined,
              fee: poolInfo.feeRate,
              mintA: poolInfo.mintA?.address,
              mintB: poolInfo.mintB?.address
            };
          });

          return { pools };
        } catch (e) {
          logger.error(`Error listing Raydium pools:`, e);
          throw fastify.httpErrors.internalServerError('Internal server error');
        }
      }
  );

  // Add a special route to quickly find the best USDC/USDT pool
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

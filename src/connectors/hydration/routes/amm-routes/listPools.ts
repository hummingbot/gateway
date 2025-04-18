import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../../schemas/trading-types/amm-schema';
import { BigNumber, PoolBase } from '@galacticcouncil/sdk';

import hydrationJson from '../../../../../conf/lists/hydration.json';

const KNOWN_TOKENS = hydrationJson.reduce((acc, token) => {
  acc[token.symbol] = token.address;
  return acc;
}, {});

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

        const hydration = await Hydration.getInstance(network);
        if (!hydration) {
          throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
        }

        const tradeRouter = await hydration.getNewTradeRouter();

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
          let pools: PoolBase[] = [];
          try {
            // In Hydration, we'll implement pagination by limiting the number of pools processed
            const poolService = await hydration.getPoolService();
            pools = await hydration.poolServiceGetPools(poolService, []);

            logger.info(`Using pagination: Found ${pools.length} total pool addresses`);
          } catch (error) {
            logger.error(`Error getting pool addresses: ${error.message}`);
            throw fastify.httpErrors.internalServerError('Failed to get pool addresses');
          }

          logger.info(`Successfully retrieved info for ${pools.length} pools`);
          
          // Filter processing
          let filteredPools = [...pools]; // Make a copy

          // Advanced filtering: Symbols and Addresses
          if (needsSymbolAndAddressMatch) {
            logger.info(`Applying specific symbol AND address matching filter`);
            const beforeCount = filteredPools.length;

            // Filter by addresses and then check if the symbols match
            filteredPools = filteredPools.filter(pool =>
              pool.tokens.every(token =>
                tokenAddressesArray.includes(token.id)
              )
            );

            logger.info(`Symbol AND address filter: ${beforeCount} → ${filteredPools.length} pools`);
          }
          // Standard filtering by individual parameters
          else if (hasTokens) {
            // Filter by token addresses
            const beforeCount = filteredPools.length;

            filteredPools = filteredPools.filter(pool =>
              // @ts-ignore
              pool.tokens.every(token =>
                allAddressesToFilterBy.includes(token.id)
              )
            );

            logger.info(`Token address filter: ${beforeCount} → ${filteredPools.length} pools`);
          }

          // Filter by pool type if specified
          if (typesArray.length > 0) {
            const beforeCount = filteredPools.length;
            filteredPools = filteredPools.filter(pool =>
              pool.type && typesArray.some(type =>
                pool.type.toLowerCase().includes(type.toLowerCase())
              )
            );
            logger.info(`Pool type filter: ${beforeCount} → ${filteredPools.length} pools`);
          }

          // Map pools to response format and process token filters
          const poolListPromises = filteredPools.map(async (pool) => {
            try {
              const [baseToken, quoteToken] = pool.tokens;
              const baseTokenSymbol = baseToken.symbol;
              const quoteTokenSymbol = quoteToken.symbol;
              const poolAddress = pool.address;

              let baseTokenAmount = 0;
              let quoteTokenAmount = 0;
              let poolPrice = 1;

              // Tentar pegar reservas
              const reserves = await hydration.getPoolReserves(poolAddress);

              if (reserves) {
                baseTokenAmount = Number(reserves.baseReserve
                  .div(BigNumber(10).pow(baseToken.decimals))
                  .toFixed(baseToken.decimals));

                quoteTokenAmount = Number(reserves.quoteReserve
                  .div(BigNumber(10).pow(quoteToken.decimals))
                  .toFixed(quoteToken.decimals));
              } else {
                // Fallback para balance direto do pool
                baseTokenAmount = Number(BigNumber(baseToken.balance.toString())
                  .div(BigNumber(10).pow(baseToken.decimals))
                  .toFixed(baseToken.decimals));

                quoteTokenAmount = Number(BigNumber(quoteToken.balance.toString())
                  .div(BigNumber(10).pow(quoteToken.decimals))
                  .toFixed(quoteToken.decimals));
              }

              // Calcular preço via tradeRouter
              try {
                const assets = await hydration.getAllTokens();
                const baseTokenId = assets.find(a => a.symbol === baseTokenSymbol)?.address;
                const quoteTokenId = assets.find(a => a.symbol === quoteTokenSymbol)?.address;

                if (baseTokenId && quoteTokenId) {
                  const amountBN = BigNumber('1');

                  const buyQuote = await hydration.tradeRouterGetBestBuy(tradeRouter, quoteTokenId, baseTokenId, amountBN);
                  const sellQuote = await hydration.tradeRouterGetBestSell(tradeRouter, baseTokenId, quoteTokenId, amountBN);

                  const buyPrice = Number(buyQuote.toHuman().spotPrice);
                  const sellPrice = Number(sellQuote.toHuman().spotPrice);
                  const midPrice = (buyPrice + sellPrice) / 2;

                  if (!isNaN(midPrice) && isFinite(midPrice)) {
                    poolPrice = Number(midPrice.toFixed(6));
                  }
                }
              } catch (priceError) {
                logger.error(`Failed to calculate pool price: ${priceError.message}`);
                // Fallback: derivar pelo ratio
                if (baseTokenAmount > 0 && quoteTokenAmount > 0) {
                  poolPrice = quoteTokenAmount / baseTokenAmount;
                }
              }

              // Calcular TVL baseado nos valores atuais
              const tvl = baseTokenAmount * poolPrice + quoteTokenAmount;

              return {
                address: pool.address,
                type: pool.type,
                tokens: [baseTokenSymbol, quoteTokenSymbol],
                tokenAddresses: [baseToken.id, quoteToken.id],
                fee: 500/10000,
                price: poolPrice,
                volume: 0, // ainda não disponível
                tvl: tvl,
                apr: 0 // ainda não disponível
              };
            } catch (error) {
              logger.error(`Error processing pool ${pool?.address}: ${error.message}`);
              return null; // ou você pode usar um objeto com valores padrão
            }
          });

          // Wait for all pool info to be processed
          let poolList = await Promise.all(poolListPromises);

          // Apply token symbol filter if token symbols are specified and we're not using official tokens
          // (if we're using official tokens, we've already filtered by address above)
          if (hasTokenSymbols && !useOfficialTokens) {
            const beforeCount = poolList.length;

            // First, handle the case when we have exactly 2 token symbols - find exact pairs
            if (tokenSymbolsArray.length === 2) {
              const [symbol1, symbol2] = tokenSymbolsArray;
              const upperSymbol1 = symbol1.toUpperCase();
              const upperSymbol2 = symbol2.toUpperCase();
              
              poolList = poolList.filter(pool => {
                // Get symbols for the pool tokens (assuming index 0 is baseToken and index 1 is quoteToken)
                const baseTokenSymbol = pool.tokens[0].toUpperCase();
                const quoteTokenSymbol = pool.tokens[1].toUpperCase();
                
                // Check for exact pair match (in either order)
                return (baseTokenSymbol === upperSymbol1 && quoteTokenSymbol === upperSymbol2) ||
                       (baseTokenSymbol === upperSymbol2 && quoteTokenSymbol === upperSymbol1);
              });
              
              logger.info(`Exact token pair filter (${symbol1}/${symbol2}): ${beforeCount} → ${poolList.length} pools`);
            }
            // For single token or more than two tokens, use the original filter
            else {
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
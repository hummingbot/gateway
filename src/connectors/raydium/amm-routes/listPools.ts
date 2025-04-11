import { FastifyPluginAsync } from 'fastify';
import { Raydium } from '../raydium';
import { logger } from '../../../services/logger';
import { isValidAmm, isValidCpmm, isValidClmm } from '../raydium.utils';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../schemas/trading-types/amm-schema';

// Update the request type to include our new parameters
interface ExtendedListPoolsRequestType extends ListPoolsRequestType {
  baseToken?: string;
  quoteToken?: string;
  maxPages?: number;
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
              baseToken: { type: 'string', description: 'Filter by base token symbol or address', examples: ['USDC'] },
              quoteToken: { type: 'string', description: 'Filter by quote token symbol or address', examples: ['USDT'] },
              maxPages: { type: 'integer', description: 'Maximum number of pages to fetch (1000 pools per page)', default:20 }
            }
          },
          response: {
            200: ListPoolsResponse
          }
        }
      },
      async (request) => {
        try {
          const { network = 'mainnet-beta', baseToken, quoteToken, maxPages = 20 } = request.query;
          
          // Log what we're filtering for
          const logMessage = [`Listing Raydium pools on network: ${network}`];
          if (baseToken) logMessage.push(`baseToken: ${baseToken}`);
          if (quoteToken) logMessage.push(`quoteToken: ${quoteToken}`);
          if (maxPages !== 20) logMessage.push(`maxPages: ${maxPages}`);
          logger.info(logMessage.join(', '));

          // Get the singleton Raydium instance for the network.
          const raydium = await Raydium.getInstance(network);
          if (!raydium) {
            throw fastify.httpErrors.serviceUnavailable('Raydium service unavailable');
          }

          // Fetch pools with the specified number of pages
          const allPools = await raydium.getAllPoolsFromAPI(maxPages);
          
          // Apply filters if provided
          let filteredPools = allPools;
          
          if (baseToken || quoteToken) {
            filteredPools = allPools.filter(poolInfo => {
              const baseMatches = !baseToken || 
                (poolInfo.mintA?.symbol && poolInfo.mintA.symbol.toUpperCase() === baseToken.toUpperCase()) || 
                poolInfo.mintA?.address === baseToken;
                
              const quoteMatches = !quoteToken || 
                (poolInfo.mintB?.symbol && poolInfo.mintB.symbol.toUpperCase() === quoteToken.toUpperCase()) || 
                poolInfo.mintB?.address === quoteToken;
              
              return baseMatches && quoteMatches;
            });
            
            logger.info(`Filtered to ${filteredPools.length} pools matching the criteria`);
          }

          // Map the pool info to your desired output format.
          const pools = filteredPools.map((poolInfo) => {
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
              // Access liquidity safely
              tvl: 'liquidity' in poolInfo ? poolInfo.liquidity : undefined,
              fee: poolInfo.feeRate
            };
          });

          return { pools };
        } catch (e) {
          logger.error(`Error listing Raydium pools:`, e);
          throw fastify.httpErrors.internalServerError('Internal server error');
        }
      }
  );
};

export default listPoolsRoute;

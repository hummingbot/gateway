import { FastifyPluginAsync } from 'fastify';
import { Solana } from '../../../chains/solana/solana';
import { Jupiter } from '../jupiter';
import { logger } from '../../../services/logger';
import { 
  GetPoolInfoRequestType, 
  GetPoolInfoRequest, 
  GetPoolInfoResponse, 
  PoolInfo 
} from '../../../schemas/trading-types/swap-schema';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: { pools: PoolInfo[] };
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information from Jupiter for a token pair',
        tags: ['jupiter'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] }
          },
          required: ['baseToken', 'quoteToken']
        },
        response: {
          200: GetPoolInfoResponse
        }
      }
    },
    async (request) => {
      try {
        const { baseToken, quoteToken } = request.query;
        const network = request.query.network || 'mainnet-beta';
        
        const solana = await Solana.getInstance(network);
        const jupiter = await Jupiter.getInstance(network);
        
        const baseTokenInfo = await solana.getToken(baseToken);
        const quoteTokenInfo = await solana.getToken(quoteToken);

        if (!baseTokenInfo || !quoteTokenInfo) {
          throw fastify.httpErrors.notFound(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
        }

        try {
          // Use a minimal amount to check if routes exist
          const minAmount = 1;
          
          // Use jupiter.getQuote instead of accessing protected jupiterQuoteApi
          try {
            const quote = await jupiter.getQuote(
              baseTokenInfo.address,
              quoteTokenInfo.address,
              minAmount,
              0.5, // 0.5% slippage as minimum
              false, // onlyDirectRoutes
              false, // asLegacyTransaction
              'ExactIn'
            );

            // Check if routes exist for this token pair
            if (quote && quote.routePlan && quote.routePlan.length > 0) {
              const poolInfoEntries = [];
              
              // Calculate price with proper decimal handling
              const price = Number(quote.outAmount) / Number(quote.inAmount) * 
                         (10 ** (baseTokenInfo.decimals - quoteTokenInfo.decimals));
              
              // Create a pool info entry for the first market in the route
              if (quote.routePlan && quote.routePlan.length > 0) {
                // Get the first pool in the route as the "main" pool
                const firstMarket = quote.routePlan[0];
                
                // Create a deterministic identifier for the pool
                // Jupiter doesn't expose exact pool IDs in the API in the way we need
                const poolAddress = `jupiter-${baseToken}-${quoteToken}`;
                
                poolInfoEntries.push({
                  address: poolAddress,
                  baseTokenAddress: baseTokenInfo.address,
                  quoteTokenAddress: quoteTokenInfo.address,
                  feePct: 0.3, // Default fee percentage for Jupiter (approximate)
                  price: price,
                  connectorName: 'jupiter',
                  marketType: 'swap'
                });
                
                // Log pool information
                logger.debug(`Jupiter pool found: ${poolAddress} for ${baseToken}-${quoteToken}`);
              } else {
                // Fallback if no specific route plan is available
                poolInfoEntries.push({
                  address: `jupiter-${baseToken}-${quoteToken}`,
                  baseTokenAddress: baseTokenInfo.address,
                  quoteTokenAddress: quoteTokenInfo.address,
                  feePct: 0.3, // Default fee percentage
                  price: price,
                  connectorName: 'jupiter',
                  marketType: 'swap'
                });
                
                logger.debug(`Jupiter route found for ${baseToken}-${quoteToken}`);
              }
              return { pools: poolInfoEntries };
            } else {
              // No routes found for this pair
              return { pools: [] };
            }
          } catch (error) {
            logger.error(`Jupiter quote error: ${error}`);
            // No routes found is a valid response
            return { pools: [] };
          }
        } catch (error) {
          logger.error(`Jupiter pool info error: ${error}`);
          if (error.message && (
            error.message.includes('NO_ROUTE_FOUND') || 
            error.message.includes('Route not found')
          )) {
            // No routes found for this pair is a valid response
            return { pools: [] };
          }
          throw error;
        }
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    }
  );
};

export default poolInfoRoute;
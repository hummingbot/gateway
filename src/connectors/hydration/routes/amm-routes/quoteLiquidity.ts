import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import { PositionStrategyType } from '../../hydration.types';
import { httpBadRequest, httpNotFound } from '../../../../services/error-handler';
import {
  QuoteLiquidityRequest,
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType
} from '../../../../schemas/trading-types/amm-schema';

/**
 * Route handler for getting a liquidity quote
 */
export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get a liquidity quote for adding liquidity to a Hydration pool',
        tags: ['hydration'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
            baseTokenAmount: { type: 'number', examples: [1] },
            quoteTokenAmount: { type: 'number', examples: [1] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: QuoteLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network = 'mainnet',
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct = 1
        } = request.query;

        // Validate inputs
        if (!baseTokenAmount && !quoteTokenAmount) {
          throw httpBadRequest('Either baseTokenAmount or quoteTokenAmount must be provided');
        }

        // Get Hydration instance
        const hydration = await Hydration.getInstance(network);
        
        try {
          // Get pool info to determine price range and pool type
          const poolInfo = await hydration.getPoolInfo(poolAddress);
          if (!poolInfo) {
            throw httpNotFound(`Pool not found: ${poolAddress}`);
          }

          // Get token symbols
          const baseTokenSymbol = await hydration.getTokenSymbol(poolInfo.baseTokenAddress);
          const quoteTokenSymbol = await hydration.getTokenSymbol(poolInfo.quoteTokenAddress);

          logger.info(`Pool info for quoteLiquidity:`, {
            poolAddress,
            poolType: poolInfo.poolType,
            baseToken: baseTokenSymbol,
            quoteToken: quoteTokenSymbol,
            fee: poolInfo.feePct
          });
          
          // Determine price range based on pool type
          const currentPrice = poolInfo.price || 10;
          
          // Calculate price range based on pool type
          let priceRange = 0.05; // Default 5%
          
          // Adjust price range based on pool type
          if (poolInfo.poolType?.toLowerCase().includes('stable')) {
            priceRange = 0.005; // 0.5% for stable pools
          } else if (poolInfo.poolType?.toLowerCase().includes('xyk') || 
                   poolInfo.poolType?.toLowerCase().includes('constantproduct')) {
            priceRange = 0.05; // 5% for XYK pools
          } else if (poolInfo.poolType?.toLowerCase().includes('omni')) {
            priceRange = 0.15; // 15% for Omnipool (wider range)
          }
          
          const lowerPrice = currentPrice * (1 - priceRange);
          const upperPrice = currentPrice * (1 + priceRange);

          // Determine which amount to use for the quote
          let amount: number;
          let amountType: 'base' | 'quote';

          if (baseTokenAmount && quoteTokenAmount) {
            // If both amounts are provided, choose based on pool type
            if (poolInfo.poolType?.toLowerCase().includes('stable')) {
              // For stable pools, prefer the token with lower volatility (usually quote)
              amount = quoteTokenAmount;
              amountType = 'quote';
            } else {
              // For other pools, use the one that would provide more balanced liquidity
              const baseValue = baseTokenAmount * currentPrice;
              const quoteValue = quoteTokenAmount;
              
              if (baseValue > quoteValue) {
                amount = baseTokenAmount;
                amountType = 'base';
              } else {
                amount = quoteTokenAmount;
                amountType = 'quote';
              }
            }
          } else {
            amount = baseTokenAmount || quoteTokenAmount;
            amountType = baseTokenAmount ? 'base' : 'quote';
          }

          // Choose appropriate strategy based on pool type
          let positionStrategy = PositionStrategyType.Balanced;
          
          // For stable pools, always use balanced
          if (poolInfo.poolType?.toLowerCase().includes('stable')) {
            positionStrategy = PositionStrategyType.Balanced;
          } 
          // For XYK pools, use a strategy based on current price vs range
          else if (poolInfo.poolType?.toLowerCase().includes('xyk') || 
                  poolInfo.poolType?.toLowerCase().includes('constantproduct')) {
            // If price is near bottom of range, favor base token (BaseHeavy)
            if (currentPrice < currentPrice * (1 - priceRange * 0.5)) {
              positionStrategy = PositionStrategyType.BaseHeavy;
            } 
            // If price is near top of range, favor quote token (QuoteHeavy)
            else if (currentPrice > currentPrice * (1 + priceRange * 0.5)) {
              positionStrategy = PositionStrategyType.QuoteHeavy;
            }
            // Otherwise use balanced strategy
            else {
              positionStrategy = PositionStrategyType.Balanced;
            }
          }
          // For Omnipool, use imbalanced
          else if (poolInfo.poolType?.toLowerCase().includes('omni')) {
            positionStrategy = PositionStrategyType.Imbalanced;
          }

          logger.info(`Quote parameters:`, {
            poolAddress,
            poolType: poolInfo.poolType,
            amountType,
            amount,
            lowerPrice,
            upperPrice,
            strategyType: positionStrategy
          });

          // Get liquidity quote
          const quote = await hydration.getLiquidityQuote(
            poolAddress,
            lowerPrice,
            upperPrice,
            amount,
            amountType,
            positionStrategy
          );
          
          logger.info(`Quote result:`, quote);

          // Calculate effective slippage (default to 1% if not provided)
          const effectiveSlippage = slippagePct / 100;

          // Ensure we don't have null values in the response
          const finalBaseAmount = quote.baseTokenAmount || 0;
          const finalQuoteAmount = quote.quoteTokenAmount || 0;

          // Map to standard AMM interface response
          return {
            baseLimited: amountType === 'base',
            baseTokenAmount: finalBaseAmount,
            quoteTokenAmount: finalQuoteAmount,
            baseTokenAmountMax: finalBaseAmount * (1 + effectiveSlippage),
            quoteTokenAmountMax: finalQuoteAmount * (1 + effectiveSlippage)
          };
        } catch (error) {
          logger.error(`Failed to get liquidity quote: ${error.message}`);
          if (error.message.includes('not found')) {
            throw httpNotFound(error.message);
          }
          throw error;
        }
      } catch (e) {
        logger.error('Error in quote-liquidity:', e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message);
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteLiquidityRoute;


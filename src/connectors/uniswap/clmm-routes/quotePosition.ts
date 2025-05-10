import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  QuotePositionRequestType, 
  QuotePositionRequest,
  QuotePositionResponseType,
  QuotePositionResponse
} from '../../../schemas/trading-types/clmm-schema';
import { parseFeeTier } from '../uniswap.utils';
import {
  Position,
  Pool as V3Pool,
  nearestUsableTick,
  tickToPrice,
  priceToClosestTick,
  FeeAmount,
} from '@uniswap/v3-sdk';
import { Token, CurrencyAmount } from '@uniswap/sdk-core';
import JSBI from 'jsbi';

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuotePositionRequestType;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Get a quote for opening a position on Uniswap V3',
        tags: ['uniswap/clmm'],
        querystring: {
          ...QuotePositionRequest,
          properties: {
            ...QuotePositionRequest.properties,
            network: { type: 'string', default: 'base' },
            lowerPrice: { type: 'number', examples: [1500] },
            upperPrice: { type: 'number', examples: [2000] },
            poolAddress: { type: 'string', examples: ['0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640'] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [200] },
            feeTier: { type: 'string', enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
          }
        },
        response: {
          200: QuotePositionResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network,
          lowerPrice,
          upperPrice,
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          feeTier
        } = request.query;
        
        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!lowerPrice || !upperPrice || (!baseToken || !quoteToken) || 
            (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Resolve tokens
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenObj ? baseToken : quoteToken}`);
        }

        // Determine fee amount from tier
        let feeAmount: FeeAmount = FeeAmount.MEDIUM; // Default
        if (feeTier) {
          feeAmount = parseFeeTier(feeTier);
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(baseToken, quoteToken, 'clmm');
          
          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }

        // Get the V3 pool
        const pool = await uniswap.getV3Pool(baseTokenObj, quoteTokenObj, feeAmount, poolAddress);
        if (!pool) {
          throw fastify.httpErrors.notFound(`Pool not found for ${baseToken}-${quoteToken}`);
        }

        // Convert price range to ticks
        // In Uniswap, ticks are log base 1.0001 of price
        // We need to convert the user's desired price range to tick range
        const token0 = pool.token0;
        const token1 = pool.token1;
        
        // Determine if we need to invert the price depending on which token is token0
        const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();
        
        // Convert prices to ticks
        let lowerTick, upperTick;
        
        // For simplicity, we'll convert the price directly to tick
        // This isn't as accurate as using the SDK's methods, but it works for demonstration
        const getTickAtSqrtRatio = (price: number): number => {
          return Math.log(Math.sqrt(price)) / Math.log(Math.sqrt(1.0001));
        };
        
        if (isBaseToken0) {
          // If base token is token0, prices are in quote/base
          lowerTick = Math.floor(getTickAtSqrtRatio(lowerPrice));
          upperTick = Math.ceil(getTickAtSqrtRatio(upperPrice));
        } else {
          // If base token is token1, prices are in base/quote
          lowerTick = Math.floor(getTickAtSqrtRatio(1/upperPrice));
          upperTick = Math.ceil(getTickAtSqrtRatio(1/lowerPrice));
        }
        
        // Ensure ticks are on valid tick spacing boundaries
        const tickSpacing = pool.tickSpacing;
        lowerTick = nearestUsableTick(lowerTick, tickSpacing);
        upperTick = nearestUsableTick(upperTick, tickSpacing);
        
        // Ensure lower < upper
        if (lowerTick >= upperTick) {
          throw fastify.httpErrors.badRequest('Lower price must be less than upper price');
        }

        // Calculate optimal token amounts
        let token0Amount = CurrencyAmount.fromRawAmount(token0, 0);
        let token1Amount = CurrencyAmount.fromRawAmount(token1, 0);
        let baseLimited = false;
        
        if (baseTokenAmount !== undefined) {
          // Convert baseTokenAmount to raw amount
          const baseAmountRaw = Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals));
          
          if (isBaseToken0) {
            token0Amount = CurrencyAmount.fromRawAmount(
              token0, 
              JSBI.BigInt(baseAmountRaw.toString())
            );
            baseLimited = true;
          } else {
            token1Amount = CurrencyAmount.fromRawAmount(
              token1, 
              JSBI.BigInt(baseAmountRaw.toString())
            );
            baseLimited = true;
          }
        }
        
        if (quoteTokenAmount !== undefined) {
          // Convert quoteTokenAmount to raw amount
          const quoteAmountRaw = Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals));
          
          if (isBaseToken0) {
            token1Amount = CurrencyAmount.fromRawAmount(
              token1, 
              JSBI.BigInt(quoteAmountRaw.toString())
            );
            
            if (baseTokenAmount === undefined) {
              baseLimited = false;
            }
          } else {
            token0Amount = CurrencyAmount.fromRawAmount(
              token0, 
              JSBI.BigInt(quoteAmountRaw.toString())
            );
            
            if (baseTokenAmount === undefined) {
              baseLimited = false;
            }
          }
        }
        
        // Create a position
        const position = Position.fromAmounts({
          pool,
          tickLower: lowerTick,
          tickUpper: upperTick,
          amount0: token0Amount.quotient,
          amount1: token1Amount.quotient,
          useFullPrecision: true
        });
        
        // Calculate the optimal amounts
        const optimalToken0Amount = position.mintAmounts.amount0;
        const optimalToken1Amount = position.mintAmounts.amount1;
        
        // Calculate actual amounts in human-readable form
        let actualBaseAmount, actualQuoteAmount;
        
        if (isBaseToken0) {
          actualBaseAmount = Number(optimalToken0Amount.toString()) / Math.pow(10, baseTokenObj.decimals);
          actualQuoteAmount = Number(optimalToken1Amount.toString()) / Math.pow(10, quoteTokenObj.decimals);
        } else {
          actualBaseAmount = Number(optimalToken1Amount.toString()) / Math.pow(10, baseTokenObj.decimals);
          actualQuoteAmount = Number(optimalToken0Amount.toString()) / Math.pow(10, quoteTokenObj.decimals);
        }
        
        // Calculate max amounts
        const baseTokenAmountMax = baseTokenAmount || actualBaseAmount;
        const quoteTokenAmountMax = quoteTokenAmount || actualQuoteAmount;
        
        // Calculate liquidity value
        const liquidity = position.liquidity.toString();

        return {
          baseLimited,
          baseTokenAmount: actualBaseAmount,
          quoteTokenAmount: actualQuoteAmount,
          baseTokenAmountMax,
          quoteTokenAmountMax,
          liquidity
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    }
  );
};

export default quotePositionRoute;
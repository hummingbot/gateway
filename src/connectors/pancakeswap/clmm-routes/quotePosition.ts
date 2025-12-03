import { Position, nearestUsableTick, tickToPrice } from '@pancakeswap/v3-sdk';
import { utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import {
  QuotePositionRequestType,
  QuotePositionRequest,
  QuotePositionResponseType,
  QuotePositionResponse,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pancakeswap } from '../pancakeswap';
import { getPancakeswapPoolInfo } from '../pancakeswap.utils';

// Constants for examples (BSC USDT-WBNB pool, current price ~0.00093)
const BASE_TOKEN_AMOUNT = 10;
const QUOTE_TOKEN_AMOUNT = 0.01;
const LOWER_PRICE_BOUND = 0.0008;
const UPPER_PRICE_BOUND = 0.001;
const POOL_ADDRESS_EXAMPLE = '0x172fcd41e0913e95784454622d1c3724f546f849';

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuotePositionRequestType;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Get a quote for opening a position on Pancakeswap V3',
        tags: ['/connector/pancakeswap'],
        querystring: {
          ...QuotePositionRequest,
          properties: {
            ...QuotePositionRequest.properties,
            network: { type: 'string', default: 'bsc', examples: ['bsc'] },
            lowerPrice: { type: 'number', examples: [LOWER_PRICE_BOUND] },
            upperPrice: { type: 'number', examples: [UPPER_PRICE_BOUND] },
            poolAddress: {
              type: 'string',
              default: POOL_ADDRESS_EXAMPLE,
              examples: [POOL_ADDRESS_EXAMPLE],
            },
            baseTokenAmount: { type: 'number', examples: [BASE_TOKEN_AMOUNT] },
            quoteTokenAmount: { type: 'number', examples: [QUOTE_TOKEN_AMOUNT] },
          },
        },
        response: {
          200: QuotePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, lowerPrice, upperPrice, poolAddress, baseTokenAmount, quoteTokenAmount } = request.query;

        const networkToUse = network;

        // Validate essential parameters
        if (
          !lowerPrice ||
          !upperPrice ||
          !poolAddress ||
          (baseTokenAmount === undefined && quoteTokenAmount === undefined)
        ) {
          throw httpErrors.badRequest('Missing required parameters');
        }

        // Get Pancakeswap and Ethereum instances
        const pancakeswap = await Pancakeswap.getInstance(networkToUse);

        // Get pool information to determine tokens
        const poolInfo = await getPancakeswapPoolInfo(poolAddress, networkToUse, 'clmm');
        if (!poolInfo) {
          throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
        }

        const baseTokenObj = await pancakeswap.getToken(poolInfo.baseTokenAddress);
        const quoteTokenObj = await pancakeswap.getToken(poolInfo.quoteTokenAddress);

        if (!baseTokenObj || !quoteTokenObj) {
          throw httpErrors.badRequest('Token information not found for pool');
        }

        // Get the V3 pool
        const pool = await pancakeswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
        if (!pool) {
          throw httpErrors.notFound(`Pool not found for ${baseTokenObj.symbol}-${quoteTokenObj.symbol}`);
        }

        // Convert price range to ticks
        // In Pancakeswap, ticks are log base 1.0001 of price
        // We need to convert the user's desired price range to tick range
        const token0 = pool.token0;
        const token1 = pool.token1;

        // Determine if we need to invert the price depending on which token is token0
        const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

        // Convert prices to ticks
        let lowerTick, upperTick;

        // Calculate ticks based on price
        // Tick = log(price) / log(1.0001)

        console.log('DEBUG: isBaseToken0:', isBaseToken0);
        console.log('DEBUG: baseToken symbol:', baseTokenObj.symbol, 'address:', baseTokenObj.address);
        console.log('DEBUG: quoteToken symbol:', quoteTokenObj.symbol, 'address:', quoteTokenObj.address);
        console.log('DEBUG: token0:', token0.symbol, 'address:', token0.address);
        console.log('DEBUG: token1:', token1.symbol, 'address:', token1.address);

        // CRITICAL INSIGHT: The pool's negative tick is confusing us!
        // The pool tick of -197547 actually represents the current price correctly
        // but in a way that seems counterintuitive.
        //
        // The issue is that Pancakeswap stores the price and tick in a specific way:
        // - sqrtPriceX96 = sqrt(token1/token0) * 2^96
        // - tick = floor(log(token1/token0) / log(1.0001))
        //
        // For this pool:
        // - token0 = WETH (18 decimals)
        // - token1 = USDC (6 decimals)
        // - Human readable price = 2637 USDC per WETH
        // - But in raw amounts: 2637 * 10^6 USDC units per 10^18 WETH units
        // - So token1/token0 in raw units = (2637 * 10^6) / 10^18 = 2637 * 10^-12
        // - This is a very small number! Hence the negative tick.

        console.log('DEBUG: Current pool tick:', pool.tickCurrent);
        console.log('DEBUG: This tick represents token1/token0 in RAW UNITS (not human readable)');

        // When calculating ticks from human-readable prices, we need to account for decimals
        const priceToTickWithDecimals = (humanPrice: number): number => {
          // Convert human price (USDC per WETH) to raw price (USDC units per WETH unit)
          const rawPrice = humanPrice * Math.pow(10, token1.decimals - token0.decimals);
          return Math.floor(Math.log(rawPrice) / Math.log(1.0001));
        };

        lowerTick = priceToTickWithDecimals(lowerPrice);
        upperTick = priceToTickWithDecimals(upperPrice);

        const currentHumanPrice = 2637; // Approximate current price
        const expectedCurrentTick = priceToTickWithDecimals(currentHumanPrice);
        console.log('DEBUG: Expected current tick for price', currentHumanPrice, ':', expectedCurrentTick);
        console.log('DEBUG: Lower price', lowerPrice, '-> tick', lowerTick);
        console.log('DEBUG: Upper price', upperPrice, '-> tick', upperTick);

        console.log('DEBUG: Raw calculated lowerTick:', lowerTick);
        console.log('DEBUG: Raw calculated upperTick:', upperTick);

        // Ensure ticks are on valid tick spacing boundaries
        const tickSpacing = pool.tickSpacing;
        lowerTick = nearestUsableTick(lowerTick, tickSpacing);
        upperTick = nearestUsableTick(upperTick, tickSpacing);

        console.log('DEBUG: Adjusted lowerTick (after tick spacing):', lowerTick);
        console.log('DEBUG: Adjusted upperTick (after tick spacing):', upperTick);
        console.log('DEBUG: Pool tick spacing:', tickSpacing);
        console.log('DEBUG: Current pool tick:', pool.tickCurrent);
        console.log('DEBUG: Pool current price (sqrtPriceX96):', pool.sqrtRatioX96.toString());

        // Calculate the actual price from sqrtPriceX96
        const sqrtPriceX96 = JSBI.toNumber(JSBI.BigInt(pool.sqrtRatioX96.toString()));
        const price = Math.pow(sqrtPriceX96 / Math.pow(2, 96), 2);
        console.log('DEBUG: Pool current price (decimal):', price);
        console.log(
          'DEBUG: Pool current price (token1/token0):',
          price * Math.pow(10, token0.decimals - token1.decimals),
        );

        // Use SDK to convert tick to price for verification
        const tickPrice = tickToPrice(token0, token1, pool.tickCurrent);
        console.log('DEBUG: Price from current tick:', tickPrice.toSignificant(6));
        console.log('DEBUG: Price from current tick (inverted):', tickPrice.invert().toSignificant(6));

        // Ensure lower < upper
        if (lowerTick >= upperTick) {
          throw httpErrors.badRequest('Lower price must be less than upper price');
        }

        // Check if the current price is within the position range
        const isInRange = pool.tickCurrent >= lowerTick && pool.tickCurrent <= upperTick;
        console.log('DEBUG: Is position in range?', isInRange);
        console.log('DEBUG: Position will require both tokens?', isInRange);

        if (!isInRange) {
          console.log('WARNING: Position is out of range!');
          console.log(
            '  Current tick:',
            pool.tickCurrent,
            'is',
            pool.tickCurrent < lowerTick ? 'below' : 'above',
            'the range',
          );
          console.log(
            '  This means the position will only contain',
            pool.tickCurrent < lowerTick ? baseTokenObj.symbol : quoteTokenObj.symbol,
          );
        }

        // Calculate optimal token amounts
        let position: Position;
        let baseLimited = false;

        console.log('DEBUG: Input amounts:');
        console.log('  - baseTokenAmount:', baseTokenAmount);
        console.log('  - quoteTokenAmount:', quoteTokenAmount);

        if (baseTokenAmount !== undefined && quoteTokenAmount !== undefined) {
          console.log('DEBUG: Using fromAmounts (both amounts provided)');
          // Both amounts provided - use fromAmounts to calculate optimal position
          // Use parseUnits to avoid scientific notation issues with large numbers
          const baseAmountRaw = JSBI.BigInt(
            utils.parseUnits(baseTokenAmount.toString(), baseTokenObj.decimals).toString(),
          );
          const quoteAmountRaw = JSBI.BigInt(
            utils.parseUnits(quoteTokenAmount.toString(), quoteTokenObj.decimals).toString(),
          );

          console.log('DEBUG: Raw amounts:');
          console.log('  - baseAmountRaw:', baseAmountRaw.toString());
          console.log('  - quoteAmountRaw:', quoteAmountRaw.toString());
          console.log('  - baseToken decimals:', baseTokenObj.decimals);
          console.log('  - quoteToken decimals:', quoteTokenObj.decimals);

          // Create position from both amounts
          if (isBaseToken0) {
            console.log('DEBUG: Creating position with base as token0');
            position = Position.fromAmounts({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: baseAmountRaw.toString(),
              amount1: quoteAmountRaw.toString(),
              useFullPrecision: true,
            });
          } else {
            console.log('DEBUG: Creating position with base as token1');
            position = Position.fromAmounts({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: quoteAmountRaw.toString(),
              amount1: baseAmountRaw.toString(),
              useFullPrecision: true,
            });
          }

          // Determine which token is limiting by comparing input vs required amounts
          const baseRequired = isBaseToken0 ? position.amount0 : position.amount1;
          const quoteRequired = isBaseToken0 ? position.amount1 : position.amount0;

          const baseRatio = parseFloat(baseAmountRaw.toString()) / parseFloat(baseRequired.quotient.toString());
          const quoteRatio = parseFloat(quoteAmountRaw.toString()) / parseFloat(quoteRequired.quotient.toString());

          baseLimited = baseRatio <= quoteRatio;
        } else if (baseTokenAmount !== undefined) {
          console.log('DEBUG: Using fromAmount (only base amount provided)');
          // Only base amount provided
          // Use parseUnits to avoid scientific notation issues with large numbers
          const baseAmountRaw = JSBI.BigInt(
            utils.parseUnits(baseTokenAmount.toString(), baseTokenObj.decimals).toString(),
          );

          console.log('DEBUG: baseAmountRaw:', baseAmountRaw.toString());

          if (isBaseToken0) {
            console.log('DEBUG: Creating position from amount0 (base is token0)');
            position = Position.fromAmount0({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: baseAmountRaw.toString(),
              useFullPrecision: true,
            });
          } else {
            console.log('DEBUG: Creating position from amount1 (base is token1)');
            position = Position.fromAmount1({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount1: baseAmountRaw.toString(),
            });
          }
          baseLimited = true;
        } else if (quoteTokenAmount !== undefined) {
          console.log('DEBUG: Using fromAmount (only quote amount provided)');
          // Only quote amount provided
          // Use parseUnits to avoid scientific notation issues with large numbers
          const quoteAmountRaw = JSBI.BigInt(
            utils.parseUnits(quoteTokenAmount.toString(), quoteTokenObj.decimals).toString(),
          );

          console.log('DEBUG: quoteAmountRaw:', quoteAmountRaw.toString());

          if (isBaseToken0) {
            console.log('DEBUG: Creating position from amount1 (quote is token1)');
            position = Position.fromAmount1({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount1: quoteAmountRaw.toString(),
            });
          } else {
            console.log('DEBUG: Creating position from amount0 (quote is token0)');
            position = Position.fromAmount0({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: quoteAmountRaw.toString(),
              useFullPrecision: true,
            });
          }
          baseLimited = false;
        } else {
          throw httpErrors.badRequest('Either base or quote token amount must be provided');
        }

        // Calculate the optimal amounts

        // Get the actual token amounts from the position
        const actualToken0Amount = position.amount0;
        const actualToken1Amount = position.amount1;

        console.log('DEBUG: Position created with:');
        console.log('  - liquidity:', position.liquidity.toString());
        console.log('  - amount0 (raw):', actualToken0Amount.quotient.toString());
        console.log('  - amount1 (raw):', actualToken1Amount.quotient.toString());
        console.log('  - amount0 (formatted):', actualToken0Amount.toSignificant(18));
        console.log('  - amount1 (formatted):', actualToken1Amount.toSignificant(18));
        console.log('  - mintAmounts.amount0:', position.mintAmounts.amount0.toString());
        console.log('  - mintAmounts.amount1:', position.mintAmounts.amount1.toString());

        // Calculate actual amounts in human-readable form
        let actualBaseAmount, actualQuoteAmount;

        if (isBaseToken0) {
          actualBaseAmount = parseFloat(actualToken0Amount.toSignificant(18));
          actualQuoteAmount = parseFloat(actualToken1Amount.toSignificant(18));
        } else {
          actualBaseAmount = parseFloat(actualToken1Amount.toSignificant(18));
          actualQuoteAmount = parseFloat(actualToken0Amount.toSignificant(18));
        }

        console.log('DEBUG: Final amounts:');
        console.log('  - actualBaseAmount:', actualBaseAmount);
        console.log('  - actualQuoteAmount:', actualQuoteAmount);
        console.log('  - baseLimited:', baseLimited);

        // Calculate max amounts
        const baseTokenAmountMax = baseTokenAmount || actualBaseAmount;
        const quoteTokenAmountMax = quoteTokenAmount || actualQuoteAmount;

        // Calculate liquidity value
        const liquidity = position.liquidity.toString();

        // Use standard gas limit for position operations
        const computeUnits = 500000;

        return {
          baseLimited,
          baseTokenAmount: actualBaseAmount,
          quoteTokenAmount: actualQuoteAmount,
          baseTokenAmountMax,
          quoteTokenAmountMax,
          liquidity,
          computeUnits,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quotePositionRoute;

// Export standalone function for use in unified routes
export async function quotePosition(
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  _slippagePct?: number,
): Promise<QuotePositionResponseType> {
  // Validate essential parameters
  if (!lowerPrice || !upperPrice || !poolAddress || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  // Get Pancakeswap instance
  const pancakeswap = await Pancakeswap.getInstance(network);

  // Get pool information to determine tokens
  const poolInfo = await getPancakeswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await pancakeswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await pancakeswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw httpErrors.badRequest('Token information not found for pool');
  }

  // Get the V3 pool
  const pool = await pancakeswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
  if (!pool) {
    throw httpErrors.notFound(`Pool not found for ${baseTokenObj.symbol}-${quoteTokenObj.symbol}`);
  }

  // Convert price range to ticks
  const token0 = pool.token0;
  const token1 = pool.token1;

  // Determine if we need to invert the price depending on which token is token0
  const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

  // Convert prices to ticks
  let lowerTick, upperTick;

  // When calculating ticks from human-readable prices, we need to account for decimals
  const priceToTickWithDecimals = (humanPrice: number): number => {
    // Convert human price to raw price accounting for decimals
    const rawPrice = humanPrice * Math.pow(10, token1.decimals - token0.decimals);
    return Math.floor(Math.log(rawPrice) / Math.log(1.0001));
  };

  lowerTick = priceToTickWithDecimals(lowerPrice);
  upperTick = priceToTickWithDecimals(upperPrice);

  // Ensure ticks are on valid tick spacing boundaries
  const tickSpacing = pool.tickSpacing;
  lowerTick = nearestUsableTick(lowerTick, tickSpacing);
  upperTick = nearestUsableTick(upperTick, tickSpacing);

  // Ensure lower < upper
  if (lowerTick >= upperTick) {
    throw httpErrors.badRequest('Lower price must be less than upper price');
  }

  // Calculate optimal token amounts
  let position: Position;
  let baseLimited = false;

  if (baseTokenAmount !== undefined && quoteTokenAmount !== undefined) {
    // Both amounts provided - use fromAmounts to calculate optimal position
    const baseAmountRaw = JSBI.BigInt(Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString());
    const quoteAmountRaw = JSBI.BigInt(Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString());

    // Create position from both amounts
    if (isBaseToken0) {
      position = Position.fromAmounts({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: baseAmountRaw.toString(),
        amount1: quoteAmountRaw.toString(),
        useFullPrecision: true,
      });
    } else {
      position = Position.fromAmounts({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: quoteAmountRaw.toString(),
        amount1: baseAmountRaw.toString(),
        useFullPrecision: true,
      });
    }

    // Determine which token is limiting by comparing input vs required amounts
    const baseRequired = isBaseToken0 ? position.amount0 : position.amount1;
    const quoteRequired = isBaseToken0 ? position.amount1 : position.amount0;

    const baseRatio = parseFloat(baseAmountRaw.toString()) / parseFloat(baseRequired.quotient.toString());
    const quoteRatio = parseFloat(quoteAmountRaw.toString()) / parseFloat(quoteRequired.quotient.toString());

    baseLimited = baseRatio <= quoteRatio;
  } else if (baseTokenAmount !== undefined) {
    // Only base amount provided
    const baseAmountRaw = JSBI.BigInt(Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString());

    if (isBaseToken0) {
      position = Position.fromAmount0({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: baseAmountRaw.toString(),
        useFullPrecision: true,
      });
    } else {
      position = Position.fromAmount1({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount1: baseAmountRaw.toString(),
      });
    }
    baseLimited = true;
  } else if (quoteTokenAmount !== undefined) {
    // Only quote amount provided
    const quoteAmountRaw = JSBI.BigInt(Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString());

    if (isBaseToken0) {
      position = Position.fromAmount1({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount1: quoteAmountRaw.toString(),
      });
    } else {
      position = Position.fromAmount0({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: quoteAmountRaw.toString(),
        useFullPrecision: true,
      });
    }
    baseLimited = false;
  } else {
    throw httpErrors.badRequest('Either base or quote token amount must be provided');
  }

  // Calculate the actual token amounts from the position
  const actualToken0Amount = position.amount0;
  const actualToken1Amount = position.amount1;

  // Calculate actual amounts in human-readable form
  let actualBaseAmount, actualQuoteAmount;

  if (isBaseToken0) {
    actualBaseAmount = parseFloat(actualToken0Amount.toSignificant(18));
    actualQuoteAmount = parseFloat(actualToken1Amount.toSignificant(18));
  } else {
    actualBaseAmount = parseFloat(actualToken1Amount.toSignificant(18));
    actualQuoteAmount = parseFloat(actualToken0Amount.toSignificant(18));
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
    liquidity,
  };
}

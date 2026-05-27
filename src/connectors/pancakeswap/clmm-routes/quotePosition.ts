import { Position, nearestUsableTick } from '@pancakeswap/v3-sdk';
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

        // When calculating ticks from human-readable prices, we need to account for decimals
        const priceToTickWithDecimals = (humanPrice: number): number => {
          // Convert human price (USDC per WETH) to raw price (USDC units per WETH unit)
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

        // Check if the current price is within the position range
        const isInRange = pool.tickCurrent >= lowerTick && pool.tickCurrent <= upperTick;
        console.log('DEBUG: Is position in range?', isInRange);
        console.log('DEBUG: Position will require both tokens?', isInRange);

        if (!isInRange) {
          logger.warn(
            `Position is out of range. Current tick: ${pool.tickCurrent}, range: [${lowerTick}, ${upperTick}]. ` +
              `Position will only contain ${pool.tickCurrent < lowerTick ? baseTokenObj.symbol : quoteTokenObj.symbol}.`,
          );
        }

        // Calculate optimal token amounts
        let position: Position;
        let baseLimited = false;

        if (baseTokenAmount !== undefined && quoteTokenAmount !== undefined) {
          // Both amounts provided - use fromAmounts to calculate optimal position
          // Use parseUnits to avoid scientific notation issues with large numbers
          const baseAmountRaw = JSBI.BigInt(
            utils.parseUnits(baseTokenAmount.toString(), baseTokenObj.decimals).toString(),
          );
          const quoteAmountRaw = JSBI.BigInt(
            utils.parseUnits(quoteTokenAmount.toString(), quoteTokenObj.decimals).toString(),
          );

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
          // Use parseUnits to avoid scientific notation issues with large numbers
          const baseAmountRaw = JSBI.BigInt(
            utils.parseUnits(baseTokenAmount.toString(), baseTokenObj.decimals).toString(),
          );

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
          // Use parseUnits to avoid scientific notation issues with large numbers
          const quoteAmountRaw = JSBI.BigInt(
            utils.parseUnits(quoteTokenAmount.toString(), quoteTokenObj.decimals).toString(),
          );

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

        // Calculate the optimal amounts

        // Get the actual token amounts from the position
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
    const baseAmountRaw = JSBI.BigInt(utils.parseUnits(baseTokenAmount.toString(), baseTokenObj.decimals).toString());
    const quoteAmountRaw = JSBI.BigInt(
      utils.parseUnits(quoteTokenAmount.toString(), quoteTokenObj.decimals).toString(),
    );

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
    const baseAmountRaw = JSBI.BigInt(utils.parseUnits(baseTokenAmount.toString(), baseTokenObj.decimals).toString());

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
    const quoteAmountRaw = JSBI.BigInt(
      utils.parseUnits(quoteTokenAmount.toString(), quoteTokenObj.decimals).toString(),
    );

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

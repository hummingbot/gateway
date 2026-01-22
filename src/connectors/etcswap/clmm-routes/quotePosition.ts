import { Position, nearestUsableTick, tickToPrice, FeeAmount } from '@etcswapv3/sdk';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  QuotePositionRequestType,
  QuotePositionRequest,
  QuotePositionResponseType,
  QuotePositionResponse,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ETCswap } from '../etcswap';
import { getETCswapPoolInfo } from '../etcswap.utils';

// Constants for examples (ETCswap WETC-USC pool)
const BASE_TOKEN_AMOUNT = 0.1;
const QUOTE_TOKEN_AMOUNT = 10;
const LOWER_PRICE_BOUND = 50;
const UPPER_PRICE_BOUND = 200;
const POOL_ADDRESS_EXAMPLE = '0x0000000000000000000000000000000000000000';

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuotePositionRequestType;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Get a quote for opening a position on ETCswap V3',
        tags: ['/connector/etcswap'],
        querystring: {
          ...QuotePositionRequest,
          properties: {
            ...QuotePositionRequest.properties,
            network: { type: 'string', default: 'classic', examples: ['classic'] },
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

        // Get ETCswap and Ethereum instances
        const etcswap = await ETCswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Check if V3 is available
        if (!etcswap.hasV3()) {
          throw httpErrors.badRequest(`V3 CLMM is not available on network: ${networkToUse}`);
        }

        // Get pool information to determine tokens
        const poolInfo = await getETCswapPoolInfo(poolAddress, networkToUse, 'clmm');
        if (!poolInfo) {
          throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
        }

        const baseTokenObj = await etcswap.getToken(poolInfo.baseTokenAddress);
        const quoteTokenObj = await etcswap.getToken(poolInfo.quoteTokenAddress);

        if (!baseTokenObj || !quoteTokenObj) {
          throw httpErrors.badRequest('Token information not found for pool');
        }

        // Get the V3 pool
        const pool = await etcswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
        if (!pool) {
          throw httpErrors.notFound(`Pool not found for ${baseTokenObj.symbol}-${quoteTokenObj.symbol}`);
        }

        // Convert price range to ticks
        const token0 = pool.token0;
        const token1 = pool.token1;

        // Determine if we need to invert the price depending on which token is token0
        const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

        // Convert prices to ticks with decimal adjustment
        const priceToTickWithDecimals = (humanPrice: number): number => {
          const rawPrice = humanPrice * Math.pow(10, token1.decimals - token0.decimals);
          return Math.floor(Math.log(rawPrice) / Math.log(1.0001));
        };

        let lowerTick = priceToTickWithDecimals(lowerPrice);
        let upperTick = priceToTickWithDecimals(upperPrice);

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

        // Calculate optimal token amounts
        let position: Position;
        let baseLimited = false;

        if (baseTokenAmount !== undefined && quoteTokenAmount !== undefined) {
          // Both amounts provided - use fromAmounts to calculate optimal position
          const baseAmountRaw = JSBI.BigInt(
            Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString(),
          );
          const quoteAmountRaw = JSBI.BigInt(
            Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString(),
          );

          // Create position from both amounts
          if (isBaseToken0) {
            position = Position.fromAmounts({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: baseAmountRaw,
              amount1: quoteAmountRaw,
              useFullPrecision: true,
            });
          } else {
            position = Position.fromAmounts({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: quoteAmountRaw,
              amount1: baseAmountRaw,
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
          const baseAmountRaw = JSBI.BigInt(
            Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString(),
          );

          if (isBaseToken0) {
            position = Position.fromAmount0({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: baseAmountRaw,
              useFullPrecision: true,
            });
          } else {
            position = Position.fromAmount1({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount1: baseAmountRaw,
            });
          }
          baseLimited = true;
        } else if (quoteTokenAmount !== undefined) {
          // Only quote amount provided
          const quoteAmountRaw = JSBI.BigInt(
            Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString(),
          );

          if (isBaseToken0) {
            position = Position.fromAmount1({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount1: quoteAmountRaw,
            });
          } else {
            position = Position.fromAmount0({
              pool,
              tickLower: lowerTick,
              tickUpper: upperTick,
              amount0: quoteAmountRaw,
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

  // Get ETCswap and Ethereum instances
  const etcswap = await ETCswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  // Check if V3 is available
  if (!etcswap.hasV3()) {
    throw httpErrors.badRequest(`V3 CLMM is not available on network: ${network}`);
  }

  // Get pool information to determine tokens
  const poolInfo = await getETCswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await etcswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await etcswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw httpErrors.badRequest('Token information not found for pool');
  }

  // Get the V3 pool
  const pool = await etcswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
  if (!pool) {
    throw httpErrors.notFound(`Pool not found for ${baseTokenObj.symbol}-${quoteTokenObj.symbol}`);
  }

  // Convert price range to ticks
  const token0 = pool.token0;
  const token1 = pool.token1;

  // Determine if we need to invert the price depending on which token is token0
  const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

  // Convert prices to ticks with decimal adjustment
  const priceToTickWithDecimals = (humanPrice: number): number => {
    const rawPrice = humanPrice * Math.pow(10, token1.decimals - token0.decimals);
    return Math.floor(Math.log(rawPrice) / Math.log(1.0001));
  };

  let lowerTick = priceToTickWithDecimals(lowerPrice);
  let upperTick = priceToTickWithDecimals(upperPrice);

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
    const baseAmountRaw = JSBI.BigInt(Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString());
    const quoteAmountRaw = JSBI.BigInt(Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString());

    if (isBaseToken0) {
      position = Position.fromAmounts({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: baseAmountRaw,
        amount1: quoteAmountRaw,
        useFullPrecision: true,
      });
    } else {
      position = Position.fromAmounts({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: quoteAmountRaw,
        amount1: baseAmountRaw,
        useFullPrecision: true,
      });
    }

    const baseRequired = isBaseToken0 ? position.amount0 : position.amount1;
    const quoteRequired = isBaseToken0 ? position.amount1 : position.amount0;

    const baseRatio = parseFloat(baseAmountRaw.toString()) / parseFloat(baseRequired.quotient.toString());
    const quoteRatio = parseFloat(quoteAmountRaw.toString()) / parseFloat(quoteRequired.quotient.toString());

    baseLimited = baseRatio <= quoteRatio;
  } else if (baseTokenAmount !== undefined) {
    const baseAmountRaw = JSBI.BigInt(Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString());

    if (isBaseToken0) {
      position = Position.fromAmount0({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: baseAmountRaw,
        useFullPrecision: true,
      });
    } else {
      position = Position.fromAmount1({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount1: baseAmountRaw,
      });
    }
    baseLimited = true;
  } else if (quoteTokenAmount !== undefined) {
    const quoteAmountRaw = JSBI.BigInt(Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString());

    if (isBaseToken0) {
      position = Position.fromAmount1({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount1: quoteAmountRaw,
      });
    } else {
      position = Position.fromAmount0({
        pool,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0: quoteAmountRaw,
        useFullPrecision: true,
      });
    }
    baseLimited = false;
  } else {
    throw httpErrors.badRequest('Either base or quote token amount must be provided');
  }

  const actualToken0Amount = position.amount0;
  const actualToken1Amount = position.amount1;

  let actualBaseAmount, actualQuoteAmount;

  if (isBaseToken0) {
    actualBaseAmount = parseFloat(actualToken0Amount.toSignificant(18));
    actualQuoteAmount = parseFloat(actualToken1Amount.toSignificant(18));
  } else {
    actualBaseAmount = parseFloat(actualToken1Amount.toSignificant(18));
    actualQuoteAmount = parseFloat(actualToken0Amount.toSignificant(18));
  }

  const baseTokenAmountMax = baseTokenAmount || actualBaseAmount;
  const quoteTokenAmountMax = quoteTokenAmount || actualQuoteAmount;

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

import { Position, nearestUsableTick } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

import { QuotePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Uniswap } from '../uniswap';
import { getUniswapPoolInfo } from '../uniswap.utils';
// Constants for examples (Base WETH-USDC pool)

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

  // Get Uniswap and Ethereum instances
  const uniswap = await Uniswap.getInstance(network);

  // Get pool information to determine tokens
  const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await uniswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await uniswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw httpErrors.badRequest('Token information not found for pool');
  }

  // Get the V3 pool
  const pool = await uniswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
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
    // Only quote amount provided
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

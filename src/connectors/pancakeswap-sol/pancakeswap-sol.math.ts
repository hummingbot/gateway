import BN from 'bn.js';
import Decimal from 'decimal.js';

/**
 * CLMM (Concentrated Liquidity Market Maker) Math Utilities
 * Based on Uniswap V3 / CLMM formulas
 */

/**
 * Convert price to sqrt price X64
 * Price is token1/token0 (quote/base)
 */
export function priceToSqrtPriceX64(price: number, decimalDiff: number): BN {
  // Adjust price for decimal difference
  const adjustedPrice = price / Math.pow(10, decimalDiff);

  // Calculate sqrt(price) * 2^64
  const sqrtPrice = Math.sqrt(adjustedPrice);
  const sqrtPriceX64 = sqrtPrice * Math.pow(2, 64);

  return new BN(sqrtPriceX64.toFixed(0));
}

/**
 * Convert sqrt price X64 to price
 */
export function sqrtPriceX64ToPrice(sqrtPriceX64: BN, decimalDiff: number): number {
  const sqrtPrice = Number(sqrtPriceX64.toString()) / Math.pow(2, 64);
  const price = sqrtPrice * sqrtPrice;

  // Adjust for decimal difference
  return price * Math.pow(10, decimalDiff);
}

/**
 * Calculate liquidity from token amounts
 *
 * Formula:
 * - If price < lower: L = amount1 / (sqrt(upper) - sqrt(lower))
 * - If price > upper: L = amount0 * sqrt(upper) * sqrt(lower) / (sqrt(upper) - sqrt(lower))
 * - If price in range: L = min(
 *     amount0 * sqrt(current) * sqrt(upper) / (sqrt(upper) - sqrt(current)),
 *     amount1 / (sqrt(current) - sqrt(lower))
 *   )
 */
export function getLiquidityFromAmounts(
  currentPrice: number,
  lowerPrice: number,
  upperPrice: number,
  amount0: number, // base token amount
  amount1: number, // quote token amount
  decimals0: number,
  decimals1: number,
): BN {
  const decimalDiff = decimals0 - decimals1;

  // Convert prices to sqrt prices
  const sqrtPriceCurrent = Math.sqrt(currentPrice / Math.pow(10, decimalDiff));
  const sqrtPriceLower = Math.sqrt(lowerPrice / Math.pow(10, decimalDiff));
  const sqrtPriceUpper = Math.sqrt(upperPrice / Math.pow(10, decimalDiff));

  // Convert amounts to raw units
  const amount0Raw = amount0 * Math.pow(10, decimals0);
  const amount1Raw = amount1 * Math.pow(10, decimals1);

  let liquidity: number;

  if (currentPrice < lowerPrice) {
    // Price below range - all liquidity in token1 (quote)
    liquidity = amount1Raw / (sqrtPriceUpper - sqrtPriceLower);
  } else if (currentPrice >= upperPrice) {
    // Price above range - all liquidity in token0 (base)
    liquidity = (amount0Raw * sqrtPriceLower * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceLower);
  } else {
    // Price in range - use minimum of both
    const liquidity0 = (amount0Raw * sqrtPriceCurrent * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceCurrent);
    const liquidity1 = amount1Raw / (sqrtPriceCurrent - sqrtPriceLower);
    liquidity = Math.min(liquidity0, liquidity1);
  }

  return new BN(Math.floor(liquidity));
}

/**
 * Calculate token amounts from liquidity
 * Inverse of getLiquidityFromAmounts
 */
export function getAmountsFromLiquidity(
  currentPrice: number,
  lowerPrice: number,
  upperPrice: number,
  liquidity: BN,
  decimals0: number,
  decimals1: number,
): { amount0: number; amount1: number } {
  const decimalDiff = decimals0 - decimals1;

  // Convert prices to sqrt prices
  const sqrtPriceCurrent = Math.sqrt(currentPrice / Math.pow(10, decimalDiff));
  const sqrtPriceLower = Math.sqrt(lowerPrice / Math.pow(10, decimalDiff));
  const sqrtPriceUpper = Math.sqrt(upperPrice / Math.pow(10, decimalDiff));

  const liquidityNum = Number(liquidity.toString());

  let amount0Raw: number;
  let amount1Raw: number;

  if (currentPrice < lowerPrice) {
    // Price below range - all liquidity in token1
    amount0Raw = 0;
    amount1Raw = liquidityNum * (sqrtPriceUpper - sqrtPriceLower);
  } else if (currentPrice >= upperPrice) {
    // Price above range - all liquidity in token0
    amount0Raw = (liquidityNum * (sqrtPriceUpper - sqrtPriceLower)) / (sqrtPriceLower * sqrtPriceUpper);
    amount1Raw = 0;
  } else {
    // Price in range
    amount0Raw = (liquidityNum * (sqrtPriceUpper - sqrtPriceCurrent)) / (sqrtPriceCurrent * sqrtPriceUpper);
    amount1Raw = liquidityNum * (sqrtPriceCurrent - sqrtPriceLower);
  }

  return {
    amount0: amount0Raw / Math.pow(10, decimals0),
    amount1: amount1Raw / Math.pow(10, decimals1),
  };
}

/**
 * Calculate liquidity from a single token amount
 * Used when user specifies only one token amount
 */
export function getLiquidityFromSingleAmount(
  currentPrice: number,
  lowerPrice: number,
  upperPrice: number,
  amount: number,
  decimals: number,
  isToken0: boolean, // true if amount is for token0 (base), false for token1 (quote)
  decimals0: number,
  decimals1: number,
): BN {
  const decimalDiff = decimals0 - decimals1;

  const sqrtPriceCurrent = Math.sqrt(currentPrice / Math.pow(10, decimalDiff));
  const sqrtPriceLower = Math.sqrt(lowerPrice / Math.pow(10, decimalDiff));
  const sqrtPriceUpper = Math.sqrt(upperPrice / Math.pow(10, decimalDiff));

  const amountRaw = amount * Math.pow(10, decimals);

  let liquidity: number;

  if (isToken0) {
    // Calculate liquidity from token0 (base) amount
    if (currentPrice >= upperPrice) {
      // All liquidity in token0
      liquidity = (amountRaw * sqrtPriceLower * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceLower);
    } else if (currentPrice < lowerPrice) {
      // No token0 needed
      liquidity = 0;
    } else {
      // Price in range
      liquidity = (amountRaw * sqrtPriceCurrent * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceCurrent);
    }
  } else {
    // Calculate liquidity from token1 (quote) amount
    if (currentPrice < lowerPrice) {
      // All liquidity in token1
      liquidity = amountRaw / (sqrtPriceUpper - sqrtPriceLower);
    } else if (currentPrice >= upperPrice) {
      // No token1 needed
      liquidity = 0;
    } else {
      // Price in range
      liquidity = amountRaw / (sqrtPriceCurrent - sqrtPriceLower);
    }
  }

  return new BN(Math.floor(liquidity));
}

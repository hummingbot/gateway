import { PublicKey } from '@solana/web3.js';

/**
 * Converts tick index to price
 * Formula: price = 1.0001^tick
 * @param tick The tick index
 * @returns The price
 */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * Converts price to nearest tick index
 * Formula: tick = log(price) / log(1.0001)
 * @param price The price
 * @returns The nearest tick index
 */
export function priceToTick(price: number): number {
  return Math.round(Math.log(price) / Math.log(1.0001));
}

/**
 * Rounds tick to the nearest valid tick for given tick spacing
 * @param tick The tick index
 * @param tickSpacing The tick spacing of the pool
 * @returns The rounded tick index
 */
export function roundTickToSpacing(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

/**
 * Calculates sqrt price from regular price
 * sqrtPrice = sqrt(price) * 2^64
 * @param price The price
 * @returns The sqrt price as bigint
 */
export function priceToSqrtPrice(price: number): bigint {
  const Q64 = BigInt(2 ** 64);
  const sqrtPrice = Math.sqrt(price);
  return BigInt(Math.floor(sqrtPrice * Number(Q64)));
}

/**
 * Calculates regular price from sqrt price
 * price = (sqrtPrice / 2^64)^2
 * @param sqrtPrice The sqrt price as bigint or string
 * @returns The regular price
 */
export function sqrtPriceToPrice(sqrtPrice: bigint | string): number {
  const sqrtPriceBigInt = typeof sqrtPrice === 'string' ? BigInt(sqrtPrice) : sqrtPrice;
  const Q64 = BigInt(2 ** 64);
  return Number(sqrtPriceBigInt * sqrtPriceBigInt) / Number(Q64 * Q64);
}

/**
 * Converts fee rate from hundredths of basis points to percentage
 * Example: 300 -> 0.03%
 * @param feeRate Fee rate in hundredths of basis points
 * @returns Fee percentage
 */
export function feeRateToPercentage(feeRate: number): number {
  return feeRate / 10000;
}

/**
 * Converts percentage to fee rate in hundredths of basis points
 * Example: 0.03 -> 300
 * @param percentage Fee percentage
 * @returns Fee rate in hundredths of basis points
 */
export function percentageToFeeRate(percentage: number): number {
  return Math.round(percentage * 10000);
}

/**
 * Calculates slippage tolerance in basis points
 * @param slippagePct Slippage percentage (0-100)
 * @returns Slippage in basis points (0-10000)
 */
export function calculateSlippageBps(slippagePct: number): number {
  return Math.round(slippagePct * 100);
}

/**
 * Formats token amount from raw amount and decimals
 * @param rawAmount Raw token amount
 * @param decimals Token decimals
 * @returns Formatted amount
 */
export function formatTokenAmount(rawAmount: bigint | string, decimals: number): number {
  const amount = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount;
  return Number(amount) / Math.pow(10, decimals);
}

/**
 * Converts UI amount to raw token amount
 * @param uiAmount UI amount
 * @param decimals Token decimals
 * @returns Raw amount as bigint
 */
export function toRawAmount(uiAmount: number, decimals: number): bigint {
  return BigInt(Math.floor(uiAmount * Math.pow(10, decimals)));
}

/**
 * Validates that a price range is valid
 * @param lowerPrice Lower price bound
 * @param upperPrice Upper price bound
 * @returns True if valid
 */
export function isValidPriceRange(lowerPrice: number, upperPrice: number): boolean {
  return lowerPrice > 0 && upperPrice > lowerPrice;
}

/**
 * Validates that tick indices are valid for the pool
 * @param lowerTick Lower tick index
 * @param upperTick Upper tick index
 * @param tickSpacing Pool's tick spacing
 * @returns True if valid
 */
export function isValidTickRange(lowerTick: number, upperTick: number, tickSpacing: number): boolean {
  return (
    lowerTick < upperTick &&
    lowerTick % tickSpacing === 0 &&
    upperTick % tickSpacing === 0 &&
    lowerTick >= -443636 && // Min tick
    upperTick <= 443636 // Max tick
  );
}

/**
 * Find a pool address for a token pair (not used in Orca)
 * Pools are discovered via API
 */
export const findPoolAddress = (
  _baseToken: string,
  _quoteToken: string,
  _poolType: 'amm' | 'clmm',
  _network: string = 'mainnet-beta',
): string | null => {
  return null;
};

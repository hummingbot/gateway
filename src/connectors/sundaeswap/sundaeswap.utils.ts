import { logger } from '../../services/logger';
import { SundaeswapConfig } from './sundaeswap.config';

/**
 * Find a pool Ident for a token pair in the configured pools
 *
 * @param baseToken Base token symbol
 * @param quoteToken Quote token symbol
 * @param poolType Type of pool ('amm' or 'clmm')
 * @param network Network name (defaults to 'mainnet-beta')
 * @returns Pool address or null if not found
 */
export const findPoolIdent = (
  baseToken: string,
  quoteToken: string,
  poolType: 'amm',
  network: string = 'mainnet',
): string | null => {
  // Get the network-specific pools
  const pools = SundaeswapConfig.getNetworkPools(network, poolType);
  if (!pools) return null;

  // Try standard order (BASE-QUOTE)
  const standardKey = `${baseToken}-${quoteToken}`;
  if (pools[standardKey]) return pools[standardKey];

  // Try reverse order (QUOTE-BASE)
  const reverseKey = `${quoteToken}-${baseToken}`;
  if (pools[reverseKey]) return pools[reverseKey];

  return null;
};

/**
 * Format token amounts for display
 * @param amount The raw amount as a string or number
 * @param decimals The token decimals
 * @returns The formatted token amount
 */
export const formatTokenAmount = (
  amount: string | number | bigint,
  decimals: number,
): number => {
  try {
    if (typeof amount === 'string') {
      return parseFloat(amount) / Math.pow(10, decimals);
    }
    if (typeof amount === 'bigint') {
      return Number(amount) / Math.pow(10, decimals);
    }
    return amount / Math.pow(10, decimals);
  } catch (error) {
    logger.error(`Error formatting token amount: ${error}`);
    return 0;
  }
};

/**
 * Check if a string is a valid fraction (in the form of 'a/b')
 * @param value The string to check
 * @returns True if the string is a valid fraction, false otherwise
 */
export function isFractionString(value: string): boolean {
  return value.includes('/') && value.split('/').length === 2;
}

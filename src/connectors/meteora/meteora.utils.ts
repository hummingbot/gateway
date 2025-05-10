import { MeteoraConfig } from './meteora.config';

/**
 * Find a pool address for a token pair in the configured pools
 * 
 * @param baseToken Base token symbol
 * @param quoteToken Quote token symbol
 * @param poolType Type of pool ('amm' or 'clmm')
 * @param network Network name (defaults to 'mainnet-beta')
 * @returns Pool address or null if not found
 */
export const findPoolAddress = (
  baseToken: string,
  quoteToken: string,
  poolType: 'amm' | 'clmm',
  network: string = 'mainnet-beta'
): string | null => {
  // Get the network-specific pools
  const pools = MeteoraConfig.getNetworkPools(network, poolType);
  if (!pools) return null;

  // Try standard order (BASE-QUOTE)
  const standardKey = `${baseToken}-${quoteToken}`;
  if (pools[standardKey]) return pools[standardKey];

  // Try reverse order (QUOTE-BASE)
  const reverseKey = `${quoteToken}-${baseToken}`;
  if (pools[reverseKey]) return pools[reverseKey];

  return null;
};
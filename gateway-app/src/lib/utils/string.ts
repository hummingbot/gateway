/**
 * String Utility Functions
 *
 * Common string manipulation functions used throughout the application.
 */

/**
 * Capitalize the first letter of a string
 * @example capitalize('raydium') => 'Raydium'
 * @example capitalize('METEORA') => 'METEORA' (doesn't change already uppercase)
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Shorten an address or hash for display
 * @param address - The address/hash to shorten
 * @param startChars - Number of characters to show at start (default: 6)
 * @param endChars - Number of characters to show at end (default: 4)
 * @example shortenAddress('0x1234567890abcdef', 6, 4) => '0x1234...cdef'
 */
export function shortenAddress(
  address: string,
  startChars = 6,
  endChars = 4
): string {
  if (!address || address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Construct chainNetwork string for API calls
 * @param chain - Chain name (e.g., 'solana', 'ethereum')
 * @param network - Network name (e.g., 'mainnet-beta', 'mainnet')
 * @returns Combined string in format 'chain-network'
 * @example getChainNetwork('solana', 'mainnet-beta') => 'solana-mainnet-beta'
 */
export function getChainNetwork(chain: string, network: string): string {
  return `${chain}-${network}`;
}

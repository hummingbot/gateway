/**
 * Utility functions for chain-related operations
 */

/**
 * ChainNetwork examples for API schemas
 * Only includes networks that are configured in conf/chains/
 * Format: chain-network (e.g., ethereum-bsc, ethereum-polygon)
 */
export const CHAIN_NETWORK_EXAMPLES = [
  'solana-mainnet-beta',
  'solana-devnet',
  'ethereum-mainnet',
  'ethereum-sepolia',
  'ethereum-bsc',
  'ethereum-polygon',
  'ethereum-arbitrum',
  'ethereum-optimism',
  'ethereum-base',
  'ethereum-avalanche',
  'ethereum-celo',
] as const;

/**
 * Map chainNetwork format (chain-network) to numeric chainId
 * @param chainNetwork - Format: "chain-network" (e.g., "solana-mainnet-beta", "ethereum-mainnet")
 * @returns Numeric chainId
 */
export function getChainId(chainNetwork: string): number {
  const chainIdMap: Record<string, number> = {
    // Solana networks
    'solana-mainnet-beta': 101,
    'solana-devnet': 103,
    'solana-testnet': 102,

    // Ethereum networks
    'ethereum-mainnet': 1,
    'ethereum-sepolia': 11155111,

    // BSC networks
    'bsc-mainnet': 56,
    'bsc-testnet': 97,

    // Polygon networks
    'polygon-mainnet': 137,
    'polygon-amoy': 80002,
    'polygon-zkevm': 1101,

    // Arbitrum networks
    'arbitrum-mainnet': 42161,
    'arbitrum-sepolia': 421614,
    'arbitrum-nova': 42170,

    // Optimism networks
    'optimism-mainnet': 10,
    'optimism-sepolia': 11155420,

    // Base networks
    'base-mainnet': 8453,
    'base-sepolia': 84532,

    // Avalanche networks
    'avalanche-mainnet': 43114,
    'avalanche-fuji': 43113,

    // Celo networks
    'celo-mainnet': 42220,
    'celo-alfajores': 44787,
  };

  const chainId = chainIdMap[chainNetwork];
  if (chainId === undefined) {
    throw new Error(`Unsupported chainNetwork: ${chainNetwork}`);
  }

  return chainId;
}

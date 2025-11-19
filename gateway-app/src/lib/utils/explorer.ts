/**
 * Explorer URL utilities for different chains and networks
 */

/**
 * Get the block explorer URL for a transaction based on chain and network
 * @param chain - The blockchain (e.g., 'solana', 'ethereum')
 * @param network - The network name (e.g., 'mainnet', 'base', 'bsc', 'devnet')
 * @param txHash - The transaction hash/signature
 * @returns The full URL to view the transaction on the block explorer
 */
export function getExplorerTxUrl(chain: string, network: string, txHash: string): string {
  if (chain === 'solana') {
    return `https://solscan.io/tx/${txHash}${network === 'devnet' ? '?cluster=devnet' : ''}`;
  }

  // Ethereum and EVM chains
  const networkExplorerMap: Record<string, string> = {
    mainnet: 'etherscan.io',
    sepolia: 'sepolia.etherscan.io',
    polygon: 'polygonscan.com',
    arbitrum: 'arbiscan.io',
    optimism: 'optimistic.etherscan.io',
    base: 'basescan.org',
    avalanche: 'snowtrace.io',
    bsc: 'bscscan.com',
    celo: 'celoscan.io',
  };

  const explorer = networkExplorerMap[network] || 'etherscan.io';
  return `https://${explorer}/tx/${txHash}`;
}

/**
 * Get the block explorer URL for an address based on chain and network
 * @param chain - The blockchain (e.g., 'solana', 'ethereum')
 * @param network - The network name (e.g., 'mainnet', 'base', 'bsc', 'devnet')
 * @param address - The wallet or contract address
 * @returns The full URL to view the address on the block explorer
 */
export function getExplorerAddressUrl(chain: string, network: string, address: string): string {
  if (chain === 'solana') {
    return `https://solscan.io/account/${address}${network === 'devnet' ? '?cluster=devnet' : ''}`;
  }

  // Ethereum and EVM chains
  const networkExplorerMap: Record<string, string> = {
    mainnet: 'etherscan.io',
    sepolia: 'sepolia.etherscan.io',
    polygon: 'polygonscan.com',
    arbitrum: 'arbiscan.io',
    optimism: 'optimistic.etherscan.io',
    base: 'basescan.org',
    avalanche: 'snowtrace.io',
    bsc: 'bscscan.com',
    celo: 'celoscan.io',
  };

  const explorer = networkExplorerMap[network] || 'etherscan.io';
  return `https://${explorer}/address/${address}`;
}

/**
 * Get the block explorer URL for a token based on chain and network
 * @param chain - The blockchain (e.g., 'solana', 'ethereum')
 * @param network - The network name (e.g., 'mainnet', 'base', 'bsc', 'devnet')
 * @param tokenAddress - The token contract address
 * @returns The full URL to view the token on the block explorer
 */
export function getExplorerTokenUrl(chain: string, network: string, tokenAddress: string): string {
  if (chain === 'solana') {
    return `https://solscan.io/token/${tokenAddress}${network === 'devnet' ? '?cluster=devnet' : ''}`;
  }

  // Ethereum and EVM chains
  const networkExplorerMap: Record<string, string> = {
    mainnet: 'etherscan.io',
    sepolia: 'sepolia.etherscan.io',
    polygon: 'polygonscan.com',
    arbitrum: 'arbiscan.io',
    optimism: 'optimistic.etherscan.io',
    base: 'basescan.org',
    avalanche: 'snowtrace.io',
    bsc: 'bscscan.com',
    celo: 'celoscan.io',
  };

  const explorer = networkExplorerMap[network] || 'etherscan.io';
  return `https://${explorer}/token/${tokenAddress}`;
}

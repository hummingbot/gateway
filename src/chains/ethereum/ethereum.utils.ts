import * as fs from 'fs';
import * as path from 'path';

import { TransactionResponse, TransactionReceipt } from '@ethersproject/providers';

import { rootPath } from '../../paths';

// Utility functions for Ethereum chain

// Default transaction confirmation timeout in milliseconds (12 seconds)
export const DEFAULT_TRANSACTION_TIMEOUT = 12000;

// Validates if the input string is a valid Ethereum address
export const isAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

// Get available Ethereum networks from template files
export const getAvailableEthereumNetworks = (): string[] => {
  const networksPath = path.join(rootPath(), 'dist/src/templates/chains/ethereum');

  try {
    const files = fs.readdirSync(networksPath);
    return files.filter((file) => file.endsWith('.yml')).map((file) => file.replace('.yml', ''));
  } catch (error) {
    // Fallback to hardcoded list if directory doesn't exist
    return ['mainnet', 'arbitrum', 'optimism', 'base', 'sepolia', 'bsc', 'avalanche', 'celo', 'polygon'];
  }
};

/**
 * Wait for a transaction to be confirmed with timeout
 * @param tx - The transaction response
 * @param timeout - Timeout in milliseconds (default: 12 seconds)
 * @returns The transaction receipt
 * @throws Error if transaction fails or times out
 */
export async function waitForTransactionWithTimeout(
  tx: TransactionResponse,
  timeout: number = DEFAULT_TRANSACTION_TIMEOUT,
): Promise<TransactionReceipt> {
  return Promise.race([
    tx.wait(),
    new Promise<TransactionReceipt>((_, reject) =>
      setTimeout(() => reject(new Error(`Transaction timeout after ${timeout}ms`)), timeout),
    ),
  ]);
}

import * as fs from 'fs';
import * as path from 'path';

import { TransactionResponse, TransactionReceipt } from '@ethersproject/providers';

import { rootPath } from '../../paths';

// Utility functions for Ethereum chain

// Default transaction confirmation timeout in milliseconds (12 seconds)
export const DEFAULT_TRANSACTION_TIMEOUT = 12000;

// Longer timeout for approval transactions (60 seconds)
export const APPROVAL_TRANSACTION_TIMEOUT = 60000;

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
 * @returns The transaction receipt (or null if timed out)
 */
export async function waitForTransactionWithTimeout(
  tx: TransactionResponse,
  timeout: number = DEFAULT_TRANSACTION_TIMEOUT,
): Promise<TransactionReceipt | null> {
  try {
    return await Promise.race([
      tx.wait(),
      new Promise<TransactionReceipt | null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ]);
  } catch (error) {
    // If the transaction reverted on-chain, tx.wait() will throw
    // We should still try to get the receipt to check the status
    // TransactionResponse doesn't have provider, we'll return null
    // The caller should handle getting the receipt separately if needed
    return null;
  }
}

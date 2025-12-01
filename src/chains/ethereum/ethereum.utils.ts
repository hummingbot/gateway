import * as fs from 'fs';
import * as path from 'path';

import { rootPath } from '../../paths';

// Utility functions for Ethereum chain

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

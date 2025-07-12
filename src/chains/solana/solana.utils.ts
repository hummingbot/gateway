import * as fs from 'fs';
import * as path from 'path';

import { rootPath } from '../../paths';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

/**
 * Get the default Solana network from config
 */
export function getDefaultSolanaNetwork(): string {
  return ConfigManagerV2.getInstance().get('solana.defaultNetwork');
}

/**
 * Get the default Solana wallet from config
 */
export function getDefaultSolanaWallet(): string {
  return ConfigManagerV2.getInstance().get('solana.defaultWallet');
}

/**
 * Get Solana network config value
 */
export function getSolanaNetworkConfig(network: string, key: string): any {
  return ConfigManagerV2.getInstance().get(`solana-${network}.${key}`);
}

/**
 * Get Solana chain config value
 */
export function getSolanaChainConfig(key: string): any {
  return ConfigManagerV2.getInstance().get(`solana.${key}`);
}

/**
 * Get available Solana networks from template files
 */
export function getAvailableSolanaNetworks(): string[] {
  const networksPath = path.join(rootPath(), 'dist/src/templates/chains/solana');

  try {
    const files = fs.readdirSync(networksPath);
    return files.filter((file) => file.endsWith('.yml')).map((file) => file.replace('.yml', ''));
  } catch (error) {
    // Fallback to hardcoded list if directory doesn't exist
    return ['mainnet-beta', 'devnet'];
  }
}

/**
 * Centralized chain configuration
 * Reads chainID and geckoId from network config files
 */

import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';

import { rootPath } from '../paths';

export interface ChainConfig {
  chainId: number;
  chain: 'ethereum' | 'solana';
  network: string;
  geckoTerminalId: string;
  chainNetwork: string; // Format: chain-network (e.g., ethereum-base, solana-mainnet-beta)
}

const ConfigDir: string = path.join(rootPath(), 'conf/');
let configsCache: ChainConfig[] | null = null;
let chainNetworkMap: Map<string, ChainConfig> | null = null;

/**
 * Load and cache chain configurations from network config files
 */
function loadConfigs(): ChainConfig[] {
  if (configsCache) return configsCache;

  const configs: ChainConfig[] = [];
  const chains = ['solana', 'ethereum'];

  for (const chain of chains) {
    const chainPath = path.join(ConfigDir, 'chains', chain);
    if (!fs.existsSync(chainPath)) continue;

    const networkFiles = fs.readdirSync(chainPath).filter((f) => f.endsWith('.yml'));

    for (const networkFile of networkFiles) {
      const network = networkFile.replace('.yml', '');
      const content = fs.readFileSync(path.join(chainPath, networkFile), 'utf8');
      const config: any = yaml.load(content);

      if (config.chainID && config.geckoId) {
        configs.push({
          chainId: config.chainID,
          chain: chain as 'ethereum' | 'solana',
          network,
          geckoTerminalId: config.geckoId,
          chainNetwork: `${chain}-${network}`,
        });
      }
    }
  }

  configsCache = configs;
  return configs;
}

/**
 * Get config by chainNetwork with lazy map initialization
 */
function getConfig(chainNetwork: string): ChainConfig {
  if (!chainNetworkMap) {
    chainNetworkMap = new Map(loadConfigs().map((c) => [c.chainNetwork, c]));
  }

  const config = chainNetworkMap.get(chainNetwork);
  if (!config) {
    throw new Error(`Unsupported chainNetwork: ${chainNetwork}`);
  }
  return config;
}

/**
 * Get chainId from chainNetwork format
 */
export function getChainId(chainNetwork: string): number {
  return getConfig(chainNetwork).chainId;
}

/**
 * Get GeckoTerminal network ID from chainNetwork format
 */
export function getGeckoTerminalId(chainNetwork: string): string {
  return getConfig(chainNetwork).geckoTerminalId;
}

/**
 * Parse chainNetwork to get chain and network components
 */
export function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const config = getConfig(chainNetwork);
  return {
    chain: config.chain,
    network: config.network,
  };
}

/**
 * Get all supported chainNetwork formats for API examples
 */
export function getSupportedChainNetworks(): string[] {
  return loadConfigs().map((c) => c.chainNetwork);
}

import * as fs from 'fs/promises';
import * as path from 'path';

import { ChainInfo, ConnectorInfo, WalletInfo } from '../types';

// Fallback data providers when Gateway is not running
export class FallbackDataProvider {
  static async getChains(): Promise<{ chains: ChainInfo[] }> {
    try {
      const configPath = './conf';
      const files = await fs.readdir(configPath);
      const chainConfigs = files
        .filter((f) => f.endsWith('.yml'))
        .map((f) => f.replace('.yml', ''))
        .filter((name) => ['ethereum', 'solana'].includes(name));

      return {
        chains: chainConfigs.map((chain) => ({
          chain: chain,
          networks:
            chain === 'solana'
              ? ['mainnet-beta', 'devnet']
              : [
                  'mainnet',
                  'arbitrum',
                  'optimism',
                  'base',
                  'sepolia',
                  'bsc',
                  'avalanche',
                  'celo',
                  'polygon',
                  'blast',
                  'zora',
                  'worldchain',
                ],
        })),
      };
    } catch (err) {
      // Return default chains
      return {
        chains: [
          {
            chain: 'ethereum',
            networks: [
              'mainnet',
              'arbitrum',
              'optimism',
              'base',
              'sepolia',
              'bsc',
              'avalanche',
              'celo',
              'polygon',
              'blast',
              'zora',
              'worldchain',
            ],
          },
          {
            chain: 'solana',
            networks: ['mainnet-beta', 'devnet'],
          },
        ],
      };
    }
  }

  static async getConnectors(
    chain?: string,
  ): Promise<{ connectors: ConnectorInfo[] }> {
    try {
      const configPath = './conf';
      const files = await fs.readdir(configPath);
      const connectorConfigs = files
        .filter((f) => f.endsWith('.yml'))
        .map((f) => f.replace('.yml', ''))
        .filter((name) =>
          ['uniswap', 'jupiter', 'meteora', 'raydium'].includes(name),
        );

      const connectorMap: Record<string, any> = {
        uniswap: {
          chain: 'ethereum',
          trading_types: ['swap', 'amm', 'clmm'],
          networks: [
            'mainnet',
            'arbitrum',
            'optimism',
            'base',
            'sepolia',
            'bsc',
            'avalanche',
            'celo',
            'polygon',
            'blast',
            'zora',
            'worldchain',
          ],
        },
        jupiter: {
          chain: 'solana',
          trading_types: ['swap'],
          networks: ['mainnet-beta', 'devnet'],
        },
        meteora: {
          chain: 'solana',
          trading_types: ['clmm', 'swap'],
          networks: ['mainnet-beta', 'devnet'],
        },
        raydium: {
          chain: 'solana',
          trading_types: ['amm', 'clmm', 'swap'],
          networks: ['mainnet-beta', 'devnet'],
        },
      };

      let connectors = connectorConfigs.map((name) => ({
        name,
        trading_types: connectorMap[name]?.trading_types || ['swap'],
        chain: connectorMap[name]?.chain || 'ethereum',
        networks: connectorMap[name]?.networks || ['mainnet'],
      }));

      if (chain) {
        connectors = connectors.filter((c) => c.chain === chain);
      }

      return { connectors };
    } catch (err) {
      return { connectors: [] };
    }
  }

  static async getWallets(chain?: string): Promise<WalletInfo[]> {
    const walletPath = './conf/wallets';
    const wallets: WalletInfo[] = [];

    try {
      const chains = chain ? [chain] : await fs.readdir(walletPath);

      for (const chainName of chains) {
        const chainPath = path.join(walletPath, chainName);
        try {
          const stat = await fs.stat(chainPath);
          if (stat.isDirectory()) {
            const files = await fs.readdir(chainPath);
            for (const file of files) {
              if (file.endsWith('.json')) {
                const address = file.replace('.json', '');
                wallets.push({
                  address,
                  chain: chainName,
                  name: `${chainName}-wallet`,
                });
              }
            }
          }
        } catch (e) {
          // Chain directory doesn't exist
        }
      }
    } catch (e) {
      // Wallet directory doesn't exist
    }

    return wallets;
  }
}

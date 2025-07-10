import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace UniswapConfig {
  // Supported networks for Uniswap
  export const chain = 'ethereum';
  export const networks = [
    'mainnet',
    'arbitrum',
    'optimism',
    'base',
    'sepolia',
    'bsc',
    'avalanche',
    'celo',
    'polygon',
  ];

  export interface RootConfig {
    // Global configuration
    slippagePct: string;
    maximumHops: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('uniswap.slippagePct'),
    maximumHops: ConfigManagerV2.getInstance().get('uniswap.maximumHops') || 4,

    availableNetworks: [
      {
        chain,
        networks,
      },
    ],
  };
}

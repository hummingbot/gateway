import { ConfigManagerV2 } from '../../services/config-manager-v2';

interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

export namespace GammaConfig {
  // Supported networks for Gamma
  export const chain = 'solana';
  export const networks = ['mainnet-beta', 'devnet'];

  export interface PoolsConfig {
    [pairKey: string]: string;
  }

  export interface NetworkConfig {
    // Pool configurations
    amm: PoolsConfig;
    clmm: PoolsConfig;
  }

  export interface NetworkPoolsConfig {
    // Dictionary of predefined pool addresses and settings by network
    [network: string]: NetworkConfig;
  }

  export interface RootConfig {
    // Global configuration
    allowedSlippage: string;

    // Network-specific configurations
    networks: NetworkPoolsConfig;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    // Global configuration
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'gamma.allowedSlippage',
    ),

    // Network-specific pools
    networks: ConfigManagerV2.getInstance().get('gamma.networks'),

    availableNetworks: [
      {
        chain: 'solana',
        networks: ['mainnet-beta', 'devnet'],
      },
    ],
  };

  // Helper methods to get pools for a specific network
  export const getNetworkPools = (
    network: string,
    poolType: 'amm' | 'clmm',
  ): PoolsConfig => {
    return config.networks[network]?.[poolType] || {};
  };
}

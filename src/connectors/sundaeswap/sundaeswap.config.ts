import { ConfigManagerV2 } from '../../services/config-manager-v2';

interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

export namespace SundaeswapConfig {
  // Supported networks for Sundaeswap
  export const chain = 'cardano';
  export const networks = ['mainnet', 'preview'];
  // Supported trading types
  export const tradingTypes = ['amm'] as const;

  export interface PoolsConfig {
    [pairKey: string]: string;
  }

  export interface NetworkConfig {
    // Pool configurations
    amm: PoolsConfig;
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
    allowedSlippage: ConfigManagerV2.getInstance().get('sundaeswap.allowedSlippage'),

    // Network-specific pools
    networks: ConfigManagerV2.getInstance().get('sundaeswap.networks'),

    availableNetworks: [
      {
        chain: 'cardano',
        networks: ['mainnet', 'preview'],
      },
    ],
  };

  // Helper methods to get pools for a specific network
  export const getNetworkPools = (network: string, poolType: 'amm'): PoolsConfig => {
    return config.networks[network]?.[poolType] || {};
  };
}

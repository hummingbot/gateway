import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace ZeroXConfig {
  export interface NetworkConfig {
    tradingTypes: string[];
    chainType: string;
    availableNetworks: string[];
    apiUrl: string;
    apiKey: string;
    allowedSlippage: number;
    contractAddress: string;
  }

  export const networks: Record<string, NetworkConfig> = {
    mainnet: {
      tradingTypes: ['SWAP'],
      chainType: 'EVM',
      availableNetworks: [
        'mainnet',
        'sepolia',
        'arbitrum',
        'avalanche',
        'base',
        'bsc',
        'celo',
        'optimism',
        'polygon',
      ],
      apiUrl: 'https://api.0x.org',
      apiKey: '', // Will be loaded dynamically
      allowedSlippage: 0.01, // Default value, will be loaded dynamically
      contractAddress: '',
    },
  };

  export const getConfig = (network: string): NetworkConfig => {
    const config = networks[network];
    if (!config) {
      throw new Error(`0x configuration not found for network: ${network}`);
    }
    return config;
  };

  export const getApiEndpoint = (network: string): string => {
    const networkMap: Record<string, string> = {
      mainnet: 'api.0x.org',
      sepolia: 'sepolia.api.0x.org',
      arbitrum: 'arbitrum.api.0x.org',
      avalanche: 'avalanche.api.0x.org',
      base: 'base.api.0x.org',
      bsc: 'bsc.api.0x.org',
      celo: 'celo.api.0x.org',
      optimism: 'optimism.api.0x.org',
      polygon: 'polygon.api.0x.org',
    };

    const endpoint = networkMap[network];
    if (!endpoint) {
      throw new Error(`0x API endpoint not found for network: ${network}`);
    }

    return `https://${endpoint}`;
  };
}

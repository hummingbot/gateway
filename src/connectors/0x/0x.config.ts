import { getAvailableEthereumNetworks } from '../../chains/ethereum/ethereum.utils';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace ZeroXConfig {
  // Supported networks for 0x
  // See https://0x.org/docs/developer-resources/supported-chains
  export const chain = 'ethereum';
  // Only include networks that are supported by 0x and available in Gateway
  export const networks = getAvailableEthereumNetworks().filter((network) =>
    ['mainnet', 'arbitrum', 'avalanche', 'base', 'bsc', 'optimism', 'polygon'].includes(network),
  );
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['router'] as const;

  export interface RootConfig {
    // Global configuration
    apiKey: string;
    slippagePct: number;
  }

  export const config: RootConfig = {
    apiKey: ConfigManagerV2.getInstance().get('0x.apiKey'),
    slippagePct: ConfigManagerV2.getInstance().get('0x.slippagePct'),
  };

  export const getApiEndpoint = (network: string): string => {
    // Only include supported networks
    const networkMap: Record<string, string> = {
      mainnet: 'api.0x.org',
      arbitrum: 'arbitrum.api.0x.org',
      avalanche: 'avalanche.api.0x.org',
      base: 'base.api.0x.org',
      bsc: 'bsc.api.0x.org',
      optimism: 'optimism.api.0x.org',
      polygon: 'polygon.api.0x.org',
    };

    const endpoint = networkMap[network];
    if (!endpoint) {
      throw new Error(
        `0x API endpoint not found for network: ${network}. Supported networks: ${Object.keys(networkMap).join(', ')}`,
      );
    }

    return `https://${endpoint}`;
  };
}

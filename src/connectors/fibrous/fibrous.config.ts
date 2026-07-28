import { getAvailableEthereumNetworks } from '../../chains/ethereum/ethereum.utils';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace FibrousConfig {
  // Supported networks for Fibrous
  // See https://docs.fibrous.finance
  export const chain = 'ethereum';
  // Only include networks that are supported by Fibrous and available in Gateway.
  // Fibrous also supports Starknet, which is not an EVM chain and therefore not
  // reachable through Gateway's Ethereum chain implementation.
  export const networks = getAvailableEthereumNetworks().filter((network) =>
    ['base', 'hyperevm', 'monad'].includes(network),
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
    apiKey: ConfigManagerV2.getInstance().get('fibrous.apiKey'),
    slippagePct: ConfigManagerV2.getInstance().get('fibrous.slippagePct'),
  };

  // Maps a Gateway network name to the Fibrous API network path segment
  const networkMap: Record<string, string> = {
    base: 'base',
    hyperevm: 'hyperevm',
    monad: 'monad',
  };

  export const getApiNetwork = (network: string): string => {
    const apiNetwork = networkMap[network];
    if (!apiNetwork) {
      throw new Error(
        `Fibrous API network not found for network: ${network}. Supported networks: ${Object.keys(networkMap).join(', ')}`,
      );
    }
    return apiNetwork;
  };

  // Fibrous exposes a V2 API for EVM networks. V1 remains available for Starknet only.
  export const getApiEndpoint = (network: string): string => `https://api.fibrous.finance/${getApiNetwork(network)}/v2`;
}

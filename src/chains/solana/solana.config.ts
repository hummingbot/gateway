import { ConfigManagerV2 } from '../../services/config-manager-v2';

import { getAvailableSolanaNetworks } from './solana.utils';

export interface SolanaNetworkConfig {
  nodeURL: string;
  nativeCurrencySymbol: string;
  defaultComputeUnits: number;
  confirmRetryInterval: number;
  confirmRetryCount: number;
  basePriorityFeePct: number;
}

export interface SolanaChainConfig {
  defaultNetwork: string;
  defaultWallet: string;
}

// Export available networks
export const networks = getAvailableSolanaNetworks();

export function getSolanaNetworkConfig(network: string): SolanaNetworkConfig {
  const namespaceId = `solana-${network}`;
  return {
    nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencySymbol'),
    defaultComputeUnits: ConfigManagerV2.getInstance().get(namespaceId + '.defaultComputeUnits'),
    confirmRetryInterval: ConfigManagerV2.getInstance().get(namespaceId + '.confirmRetryInterval'),
    confirmRetryCount: ConfigManagerV2.getInstance().get(namespaceId + '.confirmRetryCount'),
    basePriorityFeePct: ConfigManagerV2.getInstance().get(namespaceId + '.basePriorityFeePct'),
  };
}

export function getSolanaChainConfig(): SolanaChainConfig {
  return {
    defaultNetwork: ConfigManagerV2.getInstance().get('solana.defaultNetwork'),
    defaultWallet: ConfigManagerV2.getInstance().get('solana.defaultWallet'),
  };
}

import { ConfigManagerV2 } from '../../services/config-manager-v2';

import { getAvailableSolanaNetworks } from './solana.utils';

export interface SolanaNetworkConfig {
  nodeURL: string;
  nativeCurrencySymbol: string;
  defaultComputeUnits: number;
  confirmRetryInterval: number;
  confirmRetryCount: number;
  heliusAPIKey: string;
  useHeliusRestRPC: boolean;
  useHeliusWebSocketRPC: boolean;
  useHeliusSender: boolean;
  heliusRegionCode: string;
  minPriorityFeePerCU: number;
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
    heliusAPIKey: ConfigManagerV2.getInstance().get(namespaceId + '.heliusAPIKey'),
    useHeliusRestRPC: ConfigManagerV2.getInstance().get(namespaceId + '.useHeliusRestRPC'),
    useHeliusWebSocketRPC: ConfigManagerV2.getInstance().get(namespaceId + '.useHeliusWebSocketRPC'),
    useHeliusSender: ConfigManagerV2.getInstance().get(namespaceId + '.useHeliusSender'),
    heliusRegionCode: ConfigManagerV2.getInstance().get(namespaceId + '.heliusRegionCode'),
    minPriorityFeePerCU: ConfigManagerV2.getInstance().get(namespaceId + '.minPriorityFeePerCU'),
  };
}

export function getSolanaChainConfig(): SolanaChainConfig {
  return {
    defaultNetwork: ConfigManagerV2.getInstance().get('solana.defaultNetwork'),
    defaultWallet: ConfigManagerV2.getInstance().get('solana.defaultWallet'),
  };
}

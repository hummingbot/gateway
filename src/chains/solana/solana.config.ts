import { ConfigManagerV2 } from '../../services/config-manager-v2';

import { getAvailableSolanaNetworks } from './solana.utils';

export interface SolanaNetworkConfig {
  chainID: number;
  nodeURL: string;
  nativeCurrencySymbol: string;
  geckoId: string;
  swapProvider?: string;
  defaultComputeUnits: number;
  confirmRetryInterval: number;
  confirmRetryCount: number;
  minPriorityFeePerCU: number;
  maxPriorityFeePerCU?: number;
}

export interface SolanaChainConfig {
  defaultNetwork: string;
  defaultNetworks?: string[];
  defaultWallet: string;
  rpcProvider: string;
}

// Export available networks
export const networks = getAvailableSolanaNetworks();

export function getSolanaNetworkConfig(network: string): SolanaNetworkConfig {
  const namespaceId = `solana-${network}`;
  return {
    chainID: ConfigManagerV2.getInstance().get(namespaceId + '.chainID'),
    nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencySymbol'),
    geckoId: ConfigManagerV2.getInstance().get(namespaceId + '.geckoId'),
    swapProvider: ConfigManagerV2.getInstance().get(namespaceId + '.swapProvider'),
    defaultComputeUnits: ConfigManagerV2.getInstance().get(namespaceId + '.defaultComputeUnits'),
    confirmRetryInterval: ConfigManagerV2.getInstance().get(namespaceId + '.confirmRetryInterval'),
    confirmRetryCount: ConfigManagerV2.getInstance().get(namespaceId + '.confirmRetryCount'),
    minPriorityFeePerCU: ConfigManagerV2.getInstance().get(namespaceId + '.minPriorityFeePerCU'),
    maxPriorityFeePerCU: ConfigManagerV2.getInstance().get(namespaceId + '.maxPriorityFeePerCU'),
  };
}

export function getSolanaChainConfig(): SolanaChainConfig {
  return {
    defaultNetwork: ConfigManagerV2.getInstance().get('solana.defaultNetwork'),
    defaultNetworks: ConfigManagerV2.getInstance().get('solana.defaultNetworks'),
    defaultWallet: ConfigManagerV2.getInstance().get('solana.defaultWallet'),
    rpcProvider: ConfigManagerV2.getInstance().get('solana.rpcProvider') || 'url',
  };
}

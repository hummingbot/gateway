import { ConfigManagerV2 } from '../../services/config-manager-v2';

import { getAvailableEthereumNetworks } from './ethereum.utils';

export interface EthereumNetworkConfig {
  chainID: number;
  nodeURL: string;
  nativeCurrencySymbol: string;
  geckoId: string;
  swapProvider?: string;
  gasPrice?: number | null;
  baseFee?: number | null;
  priorityFee?: number | null;
  baseFeeMultiplier?: number;
  transactionExecutionTimeoutMs?: number;
}

export interface EthereumChainConfig {
  defaultNetwork: string;
  defaultWallet: string;
  rpcProvider: string;
  etherscanAPIKey?: string;
}

// Export available networks
export const networks = getAvailableEthereumNetworks();

export function getEthereumNetworkConfig(network: string): EthereumNetworkConfig {
  const namespaceId = `ethereum-${network}`;
  return {
    chainID: ConfigManagerV2.getInstance().get(namespaceId + '.chainID'),
    nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencySymbol'),
    geckoId: ConfigManagerV2.getInstance().get(namespaceId + '.geckoId'),
    swapProvider: ConfigManagerV2.getInstance().get(namespaceId + '.swapProvider'),
    gasPrice: ConfigManagerV2.getInstance().get(namespaceId + '.gasPrice'),
    baseFee: ConfigManagerV2.getInstance().get(namespaceId + '.baseFee'),
    priorityFee: ConfigManagerV2.getInstance().get(namespaceId + '.priorityFee'),
    baseFeeMultiplier: ConfigManagerV2.getInstance().get(namespaceId + '.baseFeeMultiplier'),
    transactionExecutionTimeoutMs: ConfigManagerV2.getInstance().get(namespaceId + '.transactionExecutionTimeoutMs'),
  };
}

export function getEthereumChainConfig(): EthereumChainConfig {
  return {
    defaultNetwork: ConfigManagerV2.getInstance().get('ethereum.defaultNetwork'),
    defaultWallet: ConfigManagerV2.getInstance().get('ethereum.defaultWallet'),
    rpcProvider: ConfigManagerV2.getInstance().get('ethereum.rpcProvider') || 'url',
    etherscanAPIKey: ConfigManagerV2.getInstance().get('ethereum.etherscanAPIKey'),
  };
}

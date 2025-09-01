import { ConfigManagerV2 } from '../../services/config-manager-v2';

import { getAvailableEthereumNetworks } from './ethereum.utils';

export interface EthereumNetworkConfig {
  chainID: number;
  nodeURL: string;
  nativeCurrencySymbol: string;
  minGasPrice?: number;
  rpcProvider?: string;
  infuraAPIKey?: string;
  useInfuraWebSocket?: boolean;
}

export interface EthereumChainConfig {
  defaultNetwork: string;
  defaultWallet: string;
}

// Export available networks
export const networks = getAvailableEthereumNetworks();

export function getEthereumNetworkConfig(network: string): EthereumNetworkConfig {
  const namespaceId = `ethereum-${network}`;
  return {
    chainID: ConfigManagerV2.getInstance().get(namespaceId + '.chainID'),
    nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencySymbol'),
    minGasPrice: ConfigManagerV2.getInstance().get(namespaceId + '.minGasPrice'),
    rpcProvider: ConfigManagerV2.getInstance().get(namespaceId + '.rpcProvider') || 'url',
  };
}

export function getEthereumChainConfig(): EthereumChainConfig {
  return {
    defaultNetwork: ConfigManagerV2.getInstance().get('ethereum.defaultNetwork'),
    defaultWallet: ConfigManagerV2.getInstance().get('ethereum.defaultWallet'),
  };
}

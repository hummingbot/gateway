import { ConfigManagerV2 } from '../../services/config-manager-v2';

import { getAvailableEthereumNetworks } from './ethereum.utils';

export interface EthereumNetworkConfig {
  chainID: number;
  nodeURL: string;
  nativeCurrencySymbol: string;
  minGasPrice?: number;
  infuraAPIKey?: string;
  useInfuraWebSocket?: boolean;
}

export interface EthereumChainConfig {
  defaultNetwork: string;
  defaultWallet: string;
  rpcProvider: string;
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
  };
}

export function getEthereumChainConfig(): EthereumChainConfig {
  return {
    defaultNetwork: ConfigManagerV2.getInstance().get('ethereum.defaultNetwork'),
    defaultWallet: ConfigManagerV2.getInstance().get('ethereum.defaultWallet'),
    rpcProvider: ConfigManagerV2.getInstance().get('ethereum.rpcProvider') || 'url',
  };
}

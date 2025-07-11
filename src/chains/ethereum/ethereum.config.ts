import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface EthereumNetworkConfig {
  chainID: number;
  nodeURL: string;
  nativeCurrencySymbol: string;
  manualGasPrice: number;
  gasLimitTransaction: number;
}

export function getEthereumNetworkConfig(network: string): EthereumNetworkConfig {
  const namespaceId = `ethereum-${network}`;
  return {
    chainID: ConfigManagerV2.getInstance().get(namespaceId + '.chainID'),
    nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencySymbol'),
    manualGasPrice: ConfigManagerV2.getInstance().get(namespaceId + '.manualGasPrice'),
    gasLimitTransaction: ConfigManagerV2.getInstance().get(namespaceId + '.gasLimitTransaction'),
  };
}

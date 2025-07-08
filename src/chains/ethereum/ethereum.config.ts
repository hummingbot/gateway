import path from 'path';

import { rootPath } from '../../paths';
import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  chainID: number;
  nodeURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  gasPriceRefreshInterval: number | undefined;
}

export interface EthereumGasStationConfig {
  enabled: boolean;
  gasStationURL: string;
  APIKey: string;
  gasLevel: string;
}

export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
  manualGasPrice: number;
  gasLimitTransaction: number;
}

export function getEthereumConfig(
  chainName: string,
  networkName: string,
): Config {
  const namespaceId = `${chainName}-${networkName}`;
  return {
    network: {
      name: networkName,
      chainID: ConfigManagerV2.getInstance().get(namespaceId + '.chainID'),
      nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
      tokenListType: 'FILE' as TokenListType,
      tokenListSource: path.join(
        rootPath(),
        'conf',
        'tokens',
        chainName,
        `${networkName}.json`,
      ),
      gasPriceRefreshInterval: ConfigManagerV2.getInstance().get(
        namespaceId + '.gasPriceRefreshInterval',
      ),
    },
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      namespaceId + '.nativeCurrencySymbol',
    ),
    manualGasPrice: ConfigManagerV2.getInstance().get(
      namespaceId + '.manualGasPrice',
    ),
    gasLimitTransaction: ConfigManagerV2.getInstance().get(
      namespaceId + '.gasLimitTransaction',
    ),
  };
}

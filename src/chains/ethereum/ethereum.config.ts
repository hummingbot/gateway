import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { rootPath } from '../../paths';
import path from 'path';

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
  defaultComputeUnits: number;
  gasEstimateInterval: number;
  maxFee: number;
  minFee: number;
  retryCount: number;
  retryFeeMultiplier: number;
  retryInterval: number;
}

export function getEthereumConfig(
  chainName: string,
  networkName: string,
): Config {
  const network = networkName;
  return {
    network: {
      name: network,
      chainID: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.chainID',
      ),
      nodeURL: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.nodeURL',
      ),
      tokenListType: 'FILE' as TokenListType,
      tokenListSource: path.join(
        rootPath(),
        'conf',
        'lists',
        chainName,
        `${network}.json`
      ),
      gasPriceRefreshInterval: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.gasPriceRefreshInterval',
      ),
    },
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      chainName + '.networks.' + network + '.nativeCurrencySymbol',
    ),
    manualGasPrice: ConfigManagerV2.getInstance().get(
      chainName + '.manualGasPrice',
    ),
    gasLimitTransaction: ConfigManagerV2.getInstance().get(
      chainName + '.gasLimitTransaction',
    ),
    defaultComputeUnits: ConfigManagerV2.getInstance().get(
      chainName + '.defaultComputeUnits',
    ),
    gasEstimateInterval: ConfigManagerV2.getInstance().get(
      chainName + '.gasEstimateInterval',
    ),
    maxFee: ConfigManagerV2.getInstance().get(
      chainName + '.maxFee',
    ),
    minFee: ConfigManagerV2.getInstance().get(
      chainName + '.minFee',
    ),
    retryCount: ConfigManagerV2.getInstance().get(chainName + '.retryCount'),
    retryFeeMultiplier: ConfigManagerV2.getInstance().get(
      chainName + '.retryFeeMultiplier',
    ),
    retryInterval: ConfigManagerV2.getInstance().get(
      chainName + '.retryInterval',
    ),
  };
}

import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  chainId: string;
  gasPriceRefreshInterval: number | undefined;
  nodeURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  tzktURL: string;
}

export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
  manualGasPrice: number;
  gasLimitTransaction: number;
}

export function getTezosConfig(chainName: string, networkName: string): Config {
  const network = networkName;
  return {
    network: {
      name: network,
      chainId: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.chainId'
      ),
      gasPriceRefreshInterval: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.gasPriceRefreshInterval'
      ),
      nodeURL: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.nodeURL'
      ),
      tokenListType: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.tokenListType'
      ),
      tokenListSource: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.tokenListSource'
      ),
      tzktURL: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + network + '.tzktURL'
      ),
    },
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      chainName + '.networks.' + network + '.nativeCurrencySymbol'
    ),
    manualGasPrice: ConfigManagerV2.getInstance().get(
      chainName + '.manualGasPrice'
    ),
    gasLimitTransaction: ConfigManagerV2.getInstance().get(chainName + '.gasLimitTransaction'),
  };
}
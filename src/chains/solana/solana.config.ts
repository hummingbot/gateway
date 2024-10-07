import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  nodeURL: string;
  assetListType: string;
  assetListSource: string;
  maxLRUCacheInstances: number;
}
export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
  tradingTypes: Array<string>;
}
export function getSolanaConfig(network: string): Config {
  return {
    network: {
      name: network,
      nodeURL: ConfigManagerV2.getInstance().get(
        'solana.networks.' + network + '.nodeURL',
      ),
      assetListType: ConfigManagerV2.getInstance().get(
        'solana.networks.' + network + '.assetListType',
      ),
      assetListSource: ConfigManagerV2.getInstance().get(
        'solana.networks.' + network + '.assetListSource',
      ),
      maxLRUCacheInstances: 10,
    },
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      'solana.nativeCurrencySymbol',
    ),
    tradingTypes: ['AMM'],
  };
}

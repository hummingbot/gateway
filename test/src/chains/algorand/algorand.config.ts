import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  nodeURL: string;
  indexerURL: string;
  assetListType: string;
  assetListSource: string;
  maxLRUCacheInstances: number;
}

export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
}

export function getAlgorandConfig(network: string): Config {
  return {
    network: {
      name: network,
      nodeURL: ConfigManagerV2.getInstance().get(
        'algorand.networks.' + network + '.nodeURL'
      ),
      indexerURL: ConfigManagerV2.getInstance().get(
        'algorand.networks.' + network + '.indexerURL'
      ),
      assetListType: ConfigManagerV2.getInstance().get(
        'algorand.networks.' + network + '.assetListType'
      ),
      assetListSource: ConfigManagerV2.getInstance().get(
        'algorand.networks.' + network + '.assetListSource'
      ),
      maxLRUCacheInstances: 10,
    },
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      'algorand.nativeCurrencySymbol'
    ),
  };
}

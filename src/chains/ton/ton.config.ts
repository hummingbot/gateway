import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  nodeURL: string;
  assetListType: string;
  assetListSource: string;
}

export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
  defaultMaxNumberOfRetries: number;
  defaultDelayBetweenRetries: number;
  defaultTimeout: number;
  defaultBatchSize: number;
  defaultDelayBetweenBatches: number;
}

export function getTonConfig(network: string): Config {
  return {
    network: {
      name: network,
      nodeURL: ConfigManagerV2.getInstance().get(
        'ton.networks.' + network + '.nodeURL',
      ),
      // indexerURL: ConfigManagerV2.getInstance().get(
      //   'ton.networks.' + network + '.indexerURL'
      // ),
      assetListType: ConfigManagerV2.getInstance().get(
        'ton.networks.' + network + '.assetListType',
      ),
      assetListSource: ConfigManagerV2.getInstance().get(
        'ton.networks.' + network + '.assetListSource',
      ),
    },
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      'ton.nativeCurrencySymbol',
    ),
    defaultMaxNumberOfRetries:
      ConfigManagerV2.getInstance().get('ton.defaultMaxNumberOfRetries') || 3,
    defaultDelayBetweenRetries:
      ConfigManagerV2.getInstance().get(
        'ton.defaultDelayDelayBetweenRetries',
      ) || 5,
    defaultTimeout:
      ConfigManagerV2.getInstance().get('ton.defaultTimeout') || 60,
    defaultBatchSize:
      ConfigManagerV2.getInstance().get('ton.defaultBatchSize') || 100,
    defaultDelayBetweenBatches:
      ConfigManagerV2.getInstance().get('ton.defaultDelayBetweenBatches') || 5,
  };
}

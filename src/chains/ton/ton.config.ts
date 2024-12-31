import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  nodeURL: string;
  assetListType: string;
  assetListSource: string;
  maxLRUCacheInstances: number;
  scanUrl: string;
}

export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
  defaultMaxNumberOfRetries: number;
  defaultDelayBetweenRetries: number;
  defaultTimeout: number;
  defaultBatchSize: number;
  defaultDelayBetweenBatches: number;
  defaultPollInterval: number;
  defaultMaxPollAttempts: number;
  gasPrice: number;
  gasLimit: number;
  gasCost: number;
  workchain: number;
  apiKey: string;
  rpcType: string;
  availableWalletVersions: string[];
  walletVersion: string;
}

export function getTonConfig(network: string): Config {
  return {
    network: {
      name: network,
      nodeURL: ConfigManagerV2.getInstance().get(
        'ton.networks.' + network + '.nodeURL',
      ),
      scanUrl:
        network == 'mainnet'
          ? 'https://tonscan.org'
          : 'https://testnet.tonscan.org',
      assetListType: ConfigManagerV2.getInstance().get(
        'ton.networks.' + network + '.assetListType',
      ),
      assetListSource: ConfigManagerV2.getInstance().get(
        'ton.networks.' + network + '.assetListSource',
      ),
      maxLRUCacheInstances: 10,
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
    defaultPollInterval:
      ConfigManagerV2.getInstance().get('ton.defaultPollInterval') || 2000,
    defaultMaxPollAttempts:
      ConfigManagerV2.getInstance().get('ton.defaultMaxPollAttempts') || 30,
    gasPrice: ConfigManagerV2.getInstance().get('ton.gasPrice') || 0,
    gasLimit: ConfigManagerV2.getInstance().get('ton.gasLimit') || 0,
    gasCost: ConfigManagerV2.getInstance().get('ton.gasCost') || 1,
    workchain: ConfigManagerV2.getInstance().get('ton.workchain') || 0,
    apiKey: ConfigManagerV2.getInstance().get('ton.apiKey') || 0,
    rpcType: ConfigManagerV2.getInstance().get('ton.rpcType') || 0,
    availableWalletVersions: [
      'v1r1',
      'v1r2',
      'v1r3',
      'v2r1',
      'v2r2',
      'v3r1',
      'v3r2',
      'v4',
      'v5R1',
      'v5Beta',
    ],
    walletVersion:
      ConfigManagerV2.getInstance().get('ton.walletVersion') || null,
  };
}

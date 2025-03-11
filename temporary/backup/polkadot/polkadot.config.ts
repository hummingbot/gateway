// noinspection ES6PreferShortImport
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfiguration {
  name: string;
  nodeURL: string;
  maximumLRUCacheInstances: number;
  assetListType: string;
  assetListSource: string;
}

export interface PolkadotConfiguration {
  network: NetworkConfiguration;
  nativeCurrencySymbol: string;
}

const DEFAULT_MAX_LRU_CACHE_INSTANCES = 10;

export function getPolkadotConfiguration(
  network: string,
): PolkadotConfiguration {
  const configManager = ConfigManagerV2.getInstance();

  const nodeURL = configManager.get(`polkadot.networks.${network}.nodeURL`);
  const assetListType = configManager.get(
    `polkadot.networks.${network}.assetListType`,
  );
  const assetListSource = configManager.get(
    `polkadot.networks.${network}.assetListSource`,
  );
  const nativeCurrencySymbol = configManager.get(
    `polkadot.nativeCurrencySymbol`,
  );

  return {
    network: {
      name: network,
      nodeURL,
      assetListType,
      assetListSource,
      maximumLRUCacheInstances: DEFAULT_MAX_LRU_CACHE_INSTANCES,
    },
    nativeCurrencySymbol,
  };
}

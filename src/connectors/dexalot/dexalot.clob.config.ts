import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace DexalotCLOBConfig {
  export interface NetworkConfig {
    gasLimitEstimate: number;
    tradingTypes: (type: string) => Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    addresses: (network: string) => { [name: string]: string };
    maxLRUCacheInstances: number;
  }

  export const config: NetworkConfig = {
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      `dexalot.gasLimitEstimate`
    ),
    maxLRUCacheInstances: 10,
    tradingTypes: (type: string) => {
      return type === 'spot' ? ['CLOB_SPOT'] : ['CLOB_PERP'];
    },
    availableNetworks: [
      {
        chain: 'avalanche',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('dexalot.contractAddresses')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('avalanche.networks')
          ).includes(network)
        ),
      },
    ],
    addresses: (network: string) => {
      return ConfigManagerV2.getInstance().get(
        `dexalot.contractAddresses.${network}`
      );
    },
  };
}

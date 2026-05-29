import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace HyperswapConfig {
  export const chain = 'ethereum';
  export const networks = ['hyperevm'];
  export type Network = string;

  export const tradingTypes = ['amm'] as const;

  export interface RootConfig {
    slippagePct: number;
    maximumHops: number;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('hyperswap.slippagePct'),
    maximumHops: ConfigManagerV2.getInstance().get('hyperswap.maximumHops'),
    availableNetworks: [
      {
        chain,
        networks,
      },
    ],
  };
}

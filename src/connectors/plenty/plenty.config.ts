import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace PlentyConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    poolsApi: (network: string) => string;
    analyticsApi: (network: string) => string;
    routerAddress: (network: string) => string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    chainType: string;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'plenty.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'plenty.gasLimitEstimate'
    ),
    poolsApi: (network: string) =>
      ConfigManagerV2.getInstance().get(
        'plenty.contractAddresses.' + network + '.poolsApi'
      ),
    analyticsApi: (network: string) =>
      ConfigManagerV2.getInstance().get(
        'plenty.contractAddresses.' + network + '.analyticsApi'
      ),
    routerAddress: (network: string) =>
      ConfigManagerV2.getInstance().get(
        'plenty.contractAddresses.' + network + '.router'
      ),
    tradingTypes: ['AMM'],
    chainType: 'TEZOS',
    availableNetworks: [
      { chain: 'tezos', networks: ['mainnet'] },
    ],
  };
}

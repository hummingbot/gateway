import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace QuipuswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    apiUrl: (network: string) => string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    chainType: string;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'quipuswap.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'quipuswap.gasLimitEstimate'
    ),
    apiUrl: (network: string) =>
      ConfigManagerV2.getInstance().get(
        'quipuswap.network.' + network + '.apiUrl'
      ),
    tradingTypes: ['AMM'],
    chainType: 'TEZOS',
    availableNetworks: [
      { chain: 'tezos', networks: ['mainnet'] },
    ],
  };
}

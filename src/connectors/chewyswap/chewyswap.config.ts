import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace ChewyswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    routerAddress: (chain: string, network: string) => string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'chewyswap.allowedSlippage',
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'chewyswap.gasLimitEstimate',
    ),
    ttl: ConfigManagerV2.getInstance().get('chewyswap.ttl'),
    routerAddress: (chain: string, network: string) => {
      const address = ConfigManagerV2.getInstance().get(
        'chewyswap.contractAddresses.' +
          chain +
          '.' +
          network +
          '.routerAddress',
      );
      if (address === undefined) {
        throw new Error('Router address not found');
      }
      return address;
    },
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    availableNetworks: [
      {
        chain: 'shibarium',
        networks: ['mainnet', 'puppynet'],
      },
    ],
  };
}

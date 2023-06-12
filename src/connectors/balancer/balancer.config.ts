import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace BalancerConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    maximumHops: number;
    balancerV2VaultAddress: (chain: string, network: string) => string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'balancer.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'balancer.gasLimitEstimate'
    ),
    ttl: ConfigManagerV2.getInstance().get('balancer.ttl'),
    maximumHops: ConfigManagerV2.getInstance().get('balancer.maximumHops'),
    balancerV2VaultAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
        'balancer.contractAddresses.' +
          chain +
          '.' +
          network +
          '.balancerRouterAddress'
      ),
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    availableNetworks: [
      {
        chain: 'ethereum',
        networks: ['mainnet', 'goerli', 'arbitrum_one'],
      },
      { chain: 'polygon', networks: ['mainnet', 'mumbai'] },
    ],
  };
}

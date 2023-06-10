import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';
import { BALANCER_NETWORK_CONFIG, Network } from '@balancer-labs/sdk';

export namespace BalancerConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    maximumHops: number;
    balancerV2VaultAddress: (chainId: number) => string;
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
    balancerV2VaultAddress: (chainId: number) =>
      BALANCER_NETWORK_CONFIG[chainId as Network].addresses.contracts.vault,
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

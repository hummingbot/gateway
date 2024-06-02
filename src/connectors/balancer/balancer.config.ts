import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace BalancerConfig {
  export const config: NetworkConfig = buildConfig(
    'balancer',
    ['AMM'],
    [
      {
        chain: 'avalanche',
        networks: ['avalanche'],
      },
      {
        chain: 'ethereum',
        networks: ['mainnet', 'arbitrum', 'optimism'],
      },
      {
        chain: 'polygon',
        networks: ['mainnet'],
      },
    ],
    'EVM'
  );
}

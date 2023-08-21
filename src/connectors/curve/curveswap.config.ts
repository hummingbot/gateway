import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace CurveConfig {
  export const config: NetworkConfig = buildConfig(
    'curve',
    ['AMM'],
    [
      {
        chain: 'avalanche',
        networks: ['avalanche'],
      },
      {
        chain: 'ethereum',
        networks: ['mainnet', 'arbitrum_one', 'optimism'],
      },
      {
        chain: 'polygon',
        networks: ['mainnet'],
      },
    ],
    'EVM'
  );
}

import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace PangolinConfig {
  export const config: NetworkConfig = buildConfig(
    'pangolin',
    ['AMM'],
    [{ chain: 'avalanche', networks: ['avalanche', 'fuji'] }],
    'EVM'
  );
}

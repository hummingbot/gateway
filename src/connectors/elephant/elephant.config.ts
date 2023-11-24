import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace ElephantConfig {
  export const config: NetworkConfig = buildConfig(
    'elephant',
    ['AMM'],
    [{ chain: 'harmony', networks: ['mainnet'] }],
    'EVM'
  );
}

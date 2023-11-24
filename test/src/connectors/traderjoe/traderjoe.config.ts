import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace TraderjoeConfig {
  export const config: NetworkConfig = buildConfig(
    'traderjoe',
    ['AMM'],
    [{ chain: 'avalanche', networks: ['avalanche', 'fuji'] }],
    'EVM'
  );
}

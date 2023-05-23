import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace XsswapConfig {
  export const config: NetworkConfig = buildConfig(
    'xsswap',
    ['AMM'],
    [{ chain: 'xdc', networks: ['xinfin', 'apothem'] }],
    'EVM'
  );
}

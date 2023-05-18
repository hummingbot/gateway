import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace QuickswapConfig {
  export const config: NetworkConfig = buildConfig(
    'quickswap',
    ['AMM'],
    [{ chain: 'polygon', networks: ['mainnet', 'mumbai'] }],
    'EVM'
  );
}

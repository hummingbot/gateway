import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace PancakeSwapConfig {
  export const config: NetworkConfig = buildConfig(
    'pancakeswap',
    ['AMM'],
    [{ chain: 'binance-smart-chain', networks: ['mainnet', 'testnet'] }],
    'EVM'
  );
}

import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace OpenoceanConfig {
  export const config: NetworkConfig = buildConfig(
    'openocean',
    ['AMM'],
    [
      { chain: 'avalanche', networks: ['avalanche'] },
      { chain: 'ethereum', networks: ['mainnet', 'arbitrum_one', 'optimism'] },
      { chain: 'polygon', networks: ['mainnet'] },
      { chain: 'harmony', networks: ['mainnet'] },
      { chain: 'binance-smart-chain', networks: ['mainnet'] },
      { chain: 'cronos', networks: ['mainnet'] },
    ],
    'EVM'
  );
}

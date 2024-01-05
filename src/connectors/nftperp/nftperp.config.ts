import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace NftPerpConfig {
    export const config: NetworkConfig = buildConfig(
        'nftperp',
        ['MarketOrder', 'LimitOrder'],
        [{ chain: 'ethereum', networks: ['arbitrum'] }],
        'EVM'
    );
}

import {
  buildConfig,
  NetworkConfig as V2NetworkConfig,
} from '../../network/network.utils';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace ETCSwapConfig {
  export interface NetworkConfig extends Omit<V2NetworkConfig, 'tradingTypes'> {
    maximumHops: number;
    etcswapV3SmartOrderRouterAddress: (network: string) => string;
    etcswapV3NftManagerAddress: (network: string) => string;
    tradingTypes: (type: string) => Array<string>;
    useRouter?: boolean;
    feeTier?: string;
  }

  export const v2Config: V2NetworkConfig = buildConfig(
    'etcswap',
    ['AMM'],
    [
      { chain: 'etc', networks: ['mainnet'] },
    ],
    'EVM',
  );

  export const config: NetworkConfig = {
    ...v2Config,
    ...{
      maximumHops: ConfigManagerV2.getInstance().get(`etcswap.maximumHops`),
      etcswapV3SmartOrderRouterAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `etcswap.contractAddresses.${network}.etcswapV3SmartOrderRouterAddress`,
        ),
      etcswapV3NftManagerAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `etcswap.contractAddresses.${network}.etcswapV3NftManagerAddress`,
        ),
      tradingTypes: (type: string) => {
        return type === 'swap' ? ['AMM'] : ['AMM_LP'];
      },
      useRouter: ConfigManagerV2.getInstance().get(`etcswap.useRouter`),
      feeTier: ConfigManagerV2.getInstance().get(`etcswap.feeTier`),
    },
  };
}

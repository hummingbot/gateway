import {
  buildConfig,
  NetworkConfig as V2NetworkConfig,
} from '../../network/network.utils';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace PancakeSwapConfig {
  export interface NetworkConfig extends Omit<V2NetworkConfig, 'tradingTypes'> {
    maximumHops: number;
    pancakeswapV3SmartOrderRouterAddress: (network: string) => string;
    pancakeswapV3NftManagerAddress: (network: string) => string;
    tradingTypes: (type: string) => Array<string>;
    useRouter?: boolean;
    feeTier?: string;
  }

  export const v2Config: V2NetworkConfig = buildConfig(
    'pancakeswap',
    ['AMM'],
    [{ chain: 'binance-smart-chain', networks: ['mainnet', 'testnet'] }],
    'EVM'
  );

  export const config: NetworkConfig = {
    ...v2Config,
    ...{
      maximumHops: ConfigManagerV2.getInstance().get(`pancakeswap.maximumHops`),
      pancakeswapV3SmartOrderRouterAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `pancakeswap.contractAddresses.${network}.pancakeswapV3SmartOrderRouterAddress`
        ),
      pancakeswapV3NftManagerAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `pancakeswap.contractAddresses.${network}.pancakeswapV3NftManagerAddress`
        ),
      tradingTypes: (type: string) => {
        return type === 'swap' ? ['AMM'] : ['AMM_LP'];
      },
      useRouter: ConfigManagerV2.getInstance().get(`pancakeswap.useRouter`),
      feeTier: ConfigManagerV2.getInstance().get(`pancakeswap.feeTier`),
    },
  };
}

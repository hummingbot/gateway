import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
export namespace ETCSwapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    maximumHops: number;
    etcswapV3SmartOrderRouterAddress: (network: string) => string;
    etcswapV3NftManagerAddress: (network: string) => string;
    etcswapV3FactoryAddress: (network: string) => string;
    quoterContractAddress: (network: string) => string;
    tradingTypes: (type: string) => Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
    useRouter?: boolean;
    feeTier?: string;
  }

  export const config: NetworkConfig = {
      allowedSlippage: ConfigManagerV2.getInstance().get(
        `etcswap.allowedSlippage`
      ),
      gasLimitEstimate: ConfigManagerV2.getInstance().get(
        `etcswap.gasLimitEstimate`
      ),
      ttl: ConfigManagerV2.getInstance().get(`etcswap.ttl`),
      maximumHops: ConfigManagerV2.getInstance().get(`etcswap.maximumHops`),
      etcswapV3SmartOrderRouterAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `etcswap.contractAddresses.${network}.etcswapV3SmartOrderRouterAddress`,
        ),
      etcswapV3NftManagerAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `etcswap.contractAddresses.${network}.etcswapV3NftManagerAddress`,
        ),
      etcswapV3FactoryAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `etcswap.contractAddresses.${network}.etcswapV3FactoryAddress`
        ),
      quoterContractAddress: (network: string) =>
        ConfigManagerV2.getInstance().get(
          `etcswap.contractAddresses.${network}.etcswapV3QuoterV2ContractAddress`
        ),
      tradingTypes: (type: string) => {
        return type === 'swap' ? ['AMM'] : ['AMM_LP'];
      },
      chainType: 'EVM',
      availableNetworks: [
        {
          chain: 'ethereum-classic',
          networks: ['mainnet']
        },
      ],
      useRouter: ConfigManagerV2.getInstance().get(`etcswap.useRouter`),
      feeTier: ConfigManagerV2.getInstance().get(`etcswap.feeTier`),
  };
}

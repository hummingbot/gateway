import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';
export namespace UniswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    maximumHops: number;
    uniswapV3SmartOrderRouterAddress: (network: string) => string;
    uniswapV3NftManagerAddress: (network: string) => string;
    tradingTypes: (type: string) => Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
    useRouter?: boolean;
    feeTier?: string;
    quoterContractAddress: (network: string) => string;
    uniswapV3FactoryAddress: (network: string) => string;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      `uniswap.allowedSlippage`,
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      `uniswap.gasLimitEstimate`,
    ),
    ttl: ConfigManagerV2.getInstance().get(`uniswap.ttl`),
    maximumHops: ConfigManagerV2.getInstance().get(`uniswap.maximumHops`),
    uniswapV3SmartOrderRouterAddress: (network: string) =>
      ConfigManagerV2.getInstance().get(
        `uniswap.contractAddresses.${network}.uniswapV3SmartOrderRouterAddress`,
      ),
    uniswapV3NftManagerAddress: (network: string) =>
      ConfigManagerV2.getInstance().get(
        `uniswap.contractAddresses.${network}.uniswapV3NftManagerAddress`,
      ),
    tradingTypes: (type: string) => {
      return type === 'swap' ? ['AMM'] : ['AMM_LP'];
    },
    uniswapV3FactoryAddress: (network: string) => {
      return ConfigManagerV2.getInstance().get(
        `uniswap.contractAddresses.${network}.uniswapV3FactoryAddress`,
      );
    },
    chainType: 'EVM',
    availableNetworks: [
      {
        chain: 'ethereum',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses'),
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('ethereum.networks'),
          ).includes(network),
        ),
      },
      {
        chain: 'avalanche',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses'),
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('avalanche.networks'),
          ).includes(network),
        ),
      },
      {
        chain: 'polygon',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses'),
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('polygon.networks'),
          ).includes(network),
        ),
      },
    ],
    useRouter: ConfigManagerV2.getInstance().get(`uniswap.useRouter`),
    feeTier: ConfigManagerV2.getInstance().get(`uniswap.feeTier`),
    quoterContractAddress: (network: string) =>
      ConfigManagerV2.getInstance().get(
        `uniswap.contractAddresses.${network}.uniswapV3QuoterV2ContractAddress`,
      ),
  };
}

import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';
export namespace UniswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    maximumHops: number;
    uniswapV3SmartOrderRouterAddress: (chain: string, network: string) => string;
    uniswapV3NftManagerAddress: (chain: string, network: string) => string;
    uniswapV3FactoryAddress: (chain: string, network: string) => string;
    quoterContractAddress: (chain: string, network: string) => string;
    tradingTypes: (type: string) => Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
    useRouter?: boolean;
    feeTier?: string;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      `uniswap.allowedSlippage`
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      `uniswap.gasLimitEstimate`
    ),
    ttl: ConfigManagerV2.getInstance().get(`uniswap.ttl`),
    maximumHops: ConfigManagerV2.getInstance().get(`uniswap.maximumHops`),
    uniswapV3SmartOrderRouterAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
          'uniswap.contractAddresses.' +
          chain +
          '.' +
          network +
          '.uniswapV3SmartOrderRouterAddress'
      ),
    uniswapV3NftManagerAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
          'uniswap.contractAddresses.' +
          chain +
          '.' +
          network +
          '.uniswapV3NftManagerAddress'
      ),
    uniswapV3FactoryAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
          'uniswap.contractAddresses.' +
          chain +
          '.' +
          network +
          '.uniswapV3FactoryAddress'
      ),
    quoterContractAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
          'uniswap.contractAddresses.' +
          chain +
          '.' +
          network +
          '.uniswapV3QuoterV2ContractAddress'
      ),
    tradingTypes: (type: string) => {
      return type === 'swap' ? ['AMM'] : ['AMM_LP'];
    },
    chainType: 'EVM',
    availableNetworks: [
      {
        chain: 'ethereum',
        networks: ['mainnet', 'goerli', 'arbitrum', 'optimism'],
      },
      { chain: 'polygon',
        networks: ['mainnet', 'mumbai']
      },
      { chain: 'binance-smart-chain',
        networks: ['mainnet']
      },
      { chain: 'avalanche',
        networks: ['avalanche']
      },
    ],
    useRouter: ConfigManagerV2.getInstance().get(`uniswap.useRouter`),
    feeTier: ConfigManagerV2.getInstance().get(`uniswap.feeTier`),
  };
}

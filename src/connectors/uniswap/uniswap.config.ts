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
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses.ethereum')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('ethereum.networks')
          ).includes(network)
        ),
      },
      { chain: 'polygon',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses.polygon')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('polygon.networks')
          ).includes(network)
        ),
      },
      { chain: 'binance-smart-chain',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses.binance-smart-chain')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('binance-smart-chain.networks')
          ).includes(network)
        ),
      },
      { chain: 'avalanche',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses.avalanche')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('avalanche.networks')
          ).includes(network)
        ),
      },
      { chain: 'celo',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('uniswap.contractAddresses.celo')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('celo.networks')
          ).includes(network)
        ),
      },
    ],
    useRouter: ConfigManagerV2.getInstance().get(`uniswap.useRouter`),
    feeTier: ConfigManagerV2.getInstance().get(`uniswap.feeTier`),
  };
}

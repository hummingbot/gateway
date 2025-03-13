import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace UniswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    maximumHops: number;
    useRouter?: boolean;
    feeTier?: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    contractAddresses: {
      [chain: string]: {
        [network: string]: {
          uniswapV3SmartOrderRouterAddress: string;
          uniswapV3NftManagerAddress: string;
          uniswapV3QuoterV2ContractAddress: string;
          uniswapV3FactoryAddress: string;
        }
      }
    };
    uniswapV3SmartOrderRouterAddress: (chain: string, network: string) => string;
    uniswapV3NftManagerAddress: (chain: string, network: string) => string;
    quoterContractAddress: (chain: string, network: string) => string;
    uniswapV3FactoryAddress: (chain: string, network: string) => string;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'uniswap.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'uniswap.gasLimitEstimate'
    ),
    ttl: ConfigManagerV2.getInstance().get('uniswap.ttl'),
    maximumHops: ConfigManagerV2.getInstance().get('uniswap.maximumHops'),
    useRouter: ConfigManagerV2.getInstance().get('uniswap.useRouter'),
    feeTier: ConfigManagerV2.getInstance().get('uniswap.feeTier'),
    tradingTypes: ['SWAP'],
    availableNetworks: [{
      chain: 'ethereum',
      networks: ['mainnet', 'arbitrum', 'optimism', 'base', 'sepolia', 'bsc', 'avalanche', 'celo', 'polygon']
    }],
    contractAddresses: ConfigManagerV2.getInstance().get('uniswap.contractAddresses'),

    uniswapV3SmartOrderRouterAddress: (chain: string, network: string): string => {
      return config.contractAddresses[chain][network].uniswapV3SmartOrderRouterAddress;
    },
    uniswapV3NftManagerAddress: (chain: string, network: string): string => {
      return config.contractAddresses[chain][network].uniswapV3NftManagerAddress;
    },
    quoterContractAddress: (chain: string, network: string): string => {
      return config.contractAddresses[chain][network].uniswapV3QuoterV2ContractAddress;
    },
    uniswapV3FactoryAddress: (chain: string, network: string): string => {
      return config.contractAddresses[chain][network].uniswapV3FactoryAddress;
    }
  };
}

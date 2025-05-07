import { AvailableNetworks } from '../connector.interfaces';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { 
  getUniswapV2RouterAddress,
  getUniswapV2FactoryAddress,
  getUniswapV3SmartOrderRouterAddress,
  getUniswapV3NftManagerAddress,
  getUniswapV3QuoterV2ContractAddress,
  getUniswapV3FactoryAddress,
  getUniversalRouterAddress
} from './uniswap.contracts';

export namespace UniswapConfig {
  export interface NetworkConfig {
    // Settings for specific networks
    maximumHops: number;
    useRouter: boolean;
    
    // Pool configurations
    amm: { [pairName: string]: string };
    clmm: { [pairName: string]: string };
  }

  export interface NetworkPoolsConfig {
    // Dictionary of predefined pool addresses and settings by network
    [network: string]: NetworkConfig;
  }

  export interface RootConfig {
    // Global configuration
    allowedSlippage: string;
    
    // Network-specific configurations
    networks: NetworkPoolsConfig;
    
    // Available networks
    availableNetworks: Array<AvailableNetworks>;
    
    // Exported contract address helper methods
    uniswapV2RouterAddress: (chain: string, network: string) => string;
    uniswapV2FactoryAddress: (chain: string, network: string) => string;
    uniswapV3SmartOrderRouterAddress: (chain: string, network: string) => string;
    uniswapV3NftManagerAddress: (chain: string, network: string) => string;
    quoterContractAddress: (chain: string, network: string) => string;
    uniswapV3FactoryAddress: (chain: string, network: string) => string;
    universalRouterAddress: (chain: string, network: string) => string;
  }

  export const config: RootConfig = {
    // Global configuration
    allowedSlippage: ConfigManagerV2.getInstance().get('uniswap.allowedSlippage'),
    
    // Network-specific pools
    networks: ConfigManagerV2.getInstance().get('uniswap.networks'),
    
    availableNetworks: [{
      chain: 'ethereum',
      networks: ['mainnet', 'arbitrum', 'optimism', 'base', 'sepolia', 'bsc', 'avalanche', 'celo', 'polygon', 'blast', 'zora', 'worldchain']
    }],
    
    // Contract helper methods
    uniswapV2RouterAddress: getUniswapV2RouterAddress,
    uniswapV2FactoryAddress: getUniswapV2FactoryAddress,
    uniswapV3SmartOrderRouterAddress: getUniswapV3SmartOrderRouterAddress,
    uniswapV3NftManagerAddress: getUniswapV3NftManagerAddress,
    quoterContractAddress: getUniswapV3QuoterV2ContractAddress,
    uniswapV3FactoryAddress: getUniswapV3FactoryAddress,
    universalRouterAddress: getUniversalRouterAddress
  }

  // Helper methods to get network-specific settings
  export const getNetworkMaximumHops = (network: string): number => {
    return config.networks[network]?.maximumHops || 4; // Default to 4 hops
  };

  export const getNetworkUseRouter = (network: string): boolean => {
    return config.networks[network]?.useRouter || false; // Default to false
  };
}

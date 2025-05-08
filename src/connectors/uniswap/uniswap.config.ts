import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { 
  getUniswapV2RouterAddress,
  getUniswapV2FactoryAddress,
  getUniswapV3SmartOrderRouterAddress,
  getUniswapV3NftManagerAddress,
  getUniswapV3QuoterV2ContractAddress,
  getUniswapV3FactoryAddress
} from './uniswap.contracts';

interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

export namespace UniswapConfig {
  export interface NetworkConfig {
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
    maximumHops: number;
    
    // Network-specific configurations
    networks: NetworkPoolsConfig;
    
    // Available networks
    availableNetworks: Array<AvailableNetworks>;
    
    // Exported contract address helper methods
    uniswapV2RouterAddress: (network: string) => string;
    uniswapV2FactoryAddress: (network: string) => string;
    uniswapV3SmartOrderRouterAddress: (network: string) => string;
    uniswapV3NftManagerAddress: (network: string) => string;
    quoterContractAddress: (network: string) => string;
    uniswapV3FactoryAddress: (network: string) => string;
  }

  export const config: RootConfig = {
    // Global configuration
    allowedSlippage: ConfigManagerV2.getInstance().get('uniswap.allowedSlippage'),
    maximumHops: ConfigManagerV2.getInstance().get('uniswap.maximumHops') || 4,
    
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
    uniswapV3FactoryAddress: getUniswapV3FactoryAddress
  }

  // Helper method to get maximum hops
  export const getMaximumHops = (): number => {
    return config.maximumHops || 4; // Default to 4 hops
  };
}

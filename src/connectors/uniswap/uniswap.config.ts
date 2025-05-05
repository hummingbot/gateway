import { AvailableNetworks } from '../connector.interfaces';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace UniswapConfig {
  export interface AmmConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    maximumHops: number;
    // Dictionary of predefined pool addresses for AMM (Uniswap V2)
    pools: { [pairName: string]: string };
  }

  export interface ClmmConfig {
    allowedSlippage: string;
    useRouter: boolean;
    // Dictionary of predefined pool addresses for CLMM (Uniswap V3)
    pools: { [pairName: string]: string };
  }

  export interface NetworkConfig {
    // AMM (Uniswap V2) configuration
    amm: AmmConfig;
    
    // CLMM (Uniswap V3) configuration
    clmm: ClmmConfig;
    
    // Available networks
    availableNetworks: Array<AvailableNetworks>;
    
    // Contract addresses for different networks
    contractAddresses: {
      [chain: string]: {
        [network: string]: {
          // V2 contracts
          uniswapV2RouterAddress: string;
          uniswapV2FactoryAddress: string;
          
          // V3 contracts
          uniswapV3SmartOrderRouterAddress: string;
          uniswapV3NftManagerAddress: string;
          uniswapV3QuoterV2ContractAddress: string;
          uniswapV3FactoryAddress: string;
        }
      }
    };
    
    // Helper methods to get contract addresses
    uniswapV2RouterAddress: (chain: string, network: string) => string;
    uniswapV2FactoryAddress: (chain: string, network: string) => string;
    uniswapV3SmartOrderRouterAddress: (chain: string, network: string) => string;
    uniswapV3NftManagerAddress: (chain: string, network: string) => string;
    quoterContractAddress: (chain: string, network: string) => string;
    uniswapV3FactoryAddress: (chain: string, network: string) => string;
  }

  export const config: NetworkConfig = {
    // AMM (Uniswap V2) configuration
    amm: {
      allowedSlippage: ConfigManagerV2.getInstance().get('uniswap.amm.allowedSlippage'),
      gasLimitEstimate: ConfigManagerV2.getInstance().get('uniswap.amm.gasLimitEstimate'),
      ttl: ConfigManagerV2.getInstance().get('uniswap.amm.ttl'),
      maximumHops: ConfigManagerV2.getInstance().get('uniswap.amm.maximumHops'),
      pools: ConfigManagerV2.getInstance().get('uniswap.amm.pools')
    },
    
    // CLMM (Uniswap V3) configuration
    clmm: {
      allowedSlippage: ConfigManagerV2.getInstance().get('uniswap.clmm.allowedSlippage'),
      useRouter: ConfigManagerV2.getInstance().get('uniswap.clmm.useRouter'),
      pools: ConfigManagerV2.getInstance().get('uniswap.clmm.pools')
    },
    
    availableNetworks: [{
      chain: 'ethereum',
      networks: ['mainnet', 'arbitrum', 'optimism', 'base', 'sepolia', 'bsc', 'avalanche', 'celo', 'polygon']
    }],
    
    contractAddresses: ConfigManagerV2.getInstance().get('uniswap.contractAddresses'),

    // V2 contract helper methods
    uniswapV2RouterAddress: (chain: string, network: string): string => {
      return config.contractAddresses[chain][network].uniswapV2RouterAddress || '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Default to V2 router
    },
    uniswapV2FactoryAddress: (chain: string, network: string): string => {
      return config.contractAddresses[chain][network].uniswapV2FactoryAddress || '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'; // Default to V2 factory
    },
    
    // V3 contract helper methods
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

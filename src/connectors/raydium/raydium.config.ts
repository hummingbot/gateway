import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace RaydiumConfig {
  export interface Pool {
    base: string;
    quote: string;
    poolAddress: string;
  }

  export interface PoolsConfig {
    [pairKey: string]: Pool;
  }

  export interface RouteConfig {
    allowedSlippage: string;
    pools: PoolsConfig;
  }

  export interface NetworkConfig {
    availableNetworks: Array<AvailableNetworks>;
    amm: RouteConfig;
    clmm: RouteConfig;
  }

  export const config: NetworkConfig = {
    availableNetworks: [{ chain: 'solana', networks: ['mainnet-beta', 'devnet'] }],
    amm: {
      allowedSlippage: ConfigManagerV2.getInstance().get('raydium.amm.allowedSlippage'),
      pools: ConfigManagerV2.getInstance().get('raydium.amm.pools'),
    },
    clmm: {
      allowedSlippage: ConfigManagerV2.getInstance().get('raydium.clmm.allowedSlippage'),
      pools: ConfigManagerV2.getInstance().get('raydium.clmm.pools'),
    },
  };
} 
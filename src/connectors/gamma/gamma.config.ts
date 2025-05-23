import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace GammaConfig {
  export interface PoolsConfig {
    [pairKey: string]: string;
  }

  export interface NetworkConfig {
    availableNetworks: Array<AvailableNetworks>;
    allowedSlippage: string;
    pools: PoolsConfig
  }

  export const config: NetworkConfig = {
    availableNetworks: [{ chain: 'solana', networks: ['mainnet-beta'] }],
    allowedSlippage: ConfigManagerV2.getInstance().get('gamma.allowedSlippage'),
    pools: ConfigManagerV2.getInstance().get('gamma.pools'),
  };
} 
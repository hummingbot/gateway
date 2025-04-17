import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace MeteoraConfig {
  export interface PoolsConfig {
    [pairKey: string]: string;
  }

  export interface NetworkConfig {
    allowedSlippage: string;
    availableNetworks: Array<AvailableNetworks>;
    pools: PoolsConfig;
    strategyType: number;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'meteora.allowedSlippage',
    ),
    availableNetworks: [{ chain: 'solana', networks: ['mainnet-beta', 'devnet'] }],
    pools: ConfigManagerV2.getInstance().get('meteora.pools'),
    strategyType: ConfigManagerV2.getInstance().get('meteora.strategyType') ?? 3,
  };
} 
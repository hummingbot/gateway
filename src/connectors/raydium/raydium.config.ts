import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace RaydiumConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'raydium.allowedSlippage',
    ),
    tradingTypes: ['CLMM', 'AMM', 'SWAP'],
    availableNetworks: [{ chain: 'solana', networks: ['mainnet-beta', 'devnet'] }],
  };
} 
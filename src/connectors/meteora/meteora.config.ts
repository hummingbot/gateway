import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace MeteoraConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'meteora.allowedSlippage',
    ),
    tradingTypes: ['CLMM', 'SWAP'],
    availableNetworks: [{ chain: 'solana', networks: ['mainnet-beta', 'devnet'] }],
  };
} 
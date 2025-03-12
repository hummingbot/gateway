import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace HydrationConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'hydration.allowedSlippage',
    ),
    tradingTypes: ['AMM', 'CLMM'],
    availableNetworks: [{ chain: 'polkadot', networks: ['mainnet', 'testnet'] }],
  };
}


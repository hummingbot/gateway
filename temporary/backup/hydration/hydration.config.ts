// noinspection ES6PreferShortImport
import { AvailableNetworks } from '../../services/config-manager-types';
// noinspection ES6PreferShortImport
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace HydrationConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: string[];
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'hydration.allowedSlippage',
    ),
    tradingTypes: ['AMM'],
    chainType: 'POLKADOT',
    availableNetworks: [{ chain: 'polkadot', networks: ['mainnet'] }],
  };
}

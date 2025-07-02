import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace RaydiumConfig {
  // Supported networks for Raydium
  export const chain = 'solana';
  export const networks = ['mainnet-beta', 'devnet'];

  export interface RootConfig {
    // Global configuration
    allowedSlippage: string;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'raydium.allowedSlippage',
    ),

    availableNetworks: [
      {
        chain,
        networks,
      },
    ],
  };
}

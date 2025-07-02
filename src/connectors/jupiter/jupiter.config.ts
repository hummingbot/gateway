import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace JupiterConfig {
  // Supported networks for Jupiter
  export const chain = 'solana';
  export const networks = ['mainnet-beta', 'devnet'];

  export interface RootConfig {
    // Global configuration
    allowedSlippage: string;
    priorityLevel: string;
    apiKey?: string;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'jupiter.allowedSlippage',
    ),
    priorityLevel: ConfigManagerV2.getInstance().get('jupiter.priorityLevel'),
    apiKey: ConfigManagerV2.getInstance().get('jupiter.apiKey'),

    availableNetworks: [
      {
        chain,
        networks,
      },
    ],
  };
}

import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace JupiterConfig {
  // Supported networks for Jupiter
  export const chain = 'solana';
  export const networks = ['mainnet-beta', 'devnet'];

  export interface RootConfig {
    // Global configuration
    defaultNetwork: string;
    slippagePct: number;
    priorityLevel: string;
    maxLamports: number;
    onlyDirectRoutes: boolean;
    restrictIntermediateTokens: boolean;
    apiKey?: string;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    defaultNetwork: ConfigManagerV2.getInstance().get('jupiter.defaultNetwork'),
    slippagePct: ConfigManagerV2.getInstance().get('jupiter.slippagePct'),
    priorityLevel: ConfigManagerV2.getInstance().get('jupiter.priorityLevel'),
    maxLamports: ConfigManagerV2.getInstance().get('jupiter.maxLamports'),
    onlyDirectRoutes: ConfigManagerV2.getInstance().get(
      'jupiter.onlyDirectRoutes',
    ),
    restrictIntermediateTokens: ConfigManagerV2.getInstance().get(
      'jupiter.restrictIntermediateTokens',
    ),
    apiKey: ConfigManagerV2.getInstance().get('jupiter.apiKey'),

    availableNetworks: [
      {
        chain,
        networks,
      },
    ],
  };
}

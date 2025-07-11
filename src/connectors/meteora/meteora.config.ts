import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace MeteoraConfig {
  // Supported networks for Meteora
  export const chain = 'solana';
  export const networks = ['mainnet-beta', 'devnet'];

  export interface RootConfig {
    // Global configuration
    slippagePct: number;
    strategyType: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('meteora.slippagePct'),
    strategyType: ConfigManagerV2.getInstance().get('meteora.strategyType') ?? 0,

    availableNetworks: [
      {
        chain,
        networks,
      },
    ],
  };
}

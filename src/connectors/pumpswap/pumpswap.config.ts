import { getAvailableSolanaNetworks } from '../../chains/solana/solana.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace PumpswapConfig {
  // Supported networks for Pumpswap
  export const chain = 'solana';
  export const networks = getAvailableSolanaNetworks();
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['amm'] as const;

  export interface RootConfig {
    // Global configuration
    slippagePct: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('pumpswap.slippagePct'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}

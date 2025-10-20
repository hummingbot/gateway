import { getAvailableSolanaNetworks } from '../../chains/solana/solana.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace PancakeswapSolConfig {
  // Supported networks for PancakeSwap Solana
  export const chain = 'solana';
  export const networks = getAvailableSolanaNetworks();
  export type Network = string;

  // Supported trading types (only CLMM for now)
  export const tradingTypes = ['clmm'] as const;

  export interface RootConfig {
    // Global configuration
    slippagePct: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('pancakeswap-sol.slippagePct'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}

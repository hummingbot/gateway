import { getAvailableSolanaNetworks } from '../../chains/solana/solana.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace MeteoraConfig {
  // Supported networks for Meteora
  export const chain = 'solana';
  export const networks = getAvailableSolanaNetworks();
  export type Network = string;

  // Supported trading types
  // - clmm: DLMM (dynamic liquidity market maker)
  // - amm:  DAMM v2 (constant-product cp-amm)
  // amm/clmm are DLMM and DAMM v2 pools; launch is the Dynamic Bonding Curve —
  // a pool per newly launched token, which migrates to DAMM v2 and is then traded
  // through this same connector's amm surface.
  export const tradingTypes = ['clmm', 'amm', 'launch'] as const;

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
        networks: networks,
      },
    ],
  };
}

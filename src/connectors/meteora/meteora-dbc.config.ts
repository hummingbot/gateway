import { getAvailableSolanaNetworks } from '../../chains/solana/solana.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace MeteoraDbcConfig {
  // Meteora Dynamic Bonding Curve: virtual pools that migrate to DAMM v2.
  export const chain = 'solana';
  export const networks = getAvailableSolanaNetworks();
  export type Network = string;

  // One trading type: `launch`. The curve is a venue of its own — quote/execute a
  // swap on it, read its pool state, create a token on it — and after migration the
  // token trades on DAMM v2 through this same connector's `amm` surface.
  export const tradingTypes = ['launch'] as const;

  export interface RootConfig {
    // Default slippage percentage for swaps.
    slippagePct: number;

    // The DBC config that /trading/launch/create-token creates pools from when the request
    // names none. Empty: such a launch is refused with a clear error; swaps work on any DBC pool.
    configAddress: string;

    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('meteora.launch.slippagePct'),
    configAddress: ConfigManagerV2.getInstance().get('meteora.launch.configAddress'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}

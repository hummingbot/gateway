import { getAvailableSolanaNetworks } from '../../chains/solana/solana.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace PumpConfig {
  // Supported networks for pump.fun (bonding curve + PumpSwap AMM)
  export const chain = 'solana';
  export const networks = getAvailableSolanaNetworks();
  export type Network = string;

  // router: bonding-curve swaps that auto-route to the canonical PumpSwap pool
  // after graduation; amm: PumpSwap pools; launch: token creation.
  export const tradingTypes = ['router', 'amm', 'launch'] as const;

  export interface RootConfig {
    // Global configuration
    slippagePct: number;

    // An address lookup table for a create with an atomic dev buy, which exceeds
    // the transaction size limit as a legacy transaction and is compiled as a v0
    // message against this table. Empty: such a create is refused.
    lookupTableAddress: string;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('pump.slippagePct'),
    lookupTableAddress: ConfigManagerV2.getInstance().get('pump.lookupTableAddress'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}

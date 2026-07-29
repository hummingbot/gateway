import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace TitanConfig {
  // Titan's DART swap API serves Solana mainnet only
  export const chain = 'solana';
  export const networks = ['mainnet-beta'];
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['router'] as const;

  export interface RootConfig {
    slippagePct: number;
    apiKey?: string;
    computeUnitPrice: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('titan.slippagePct'),
    apiKey: ConfigManagerV2.getInstance().get('titan.apiKey'),
    computeUnitPrice: ConfigManagerV2.getInstance().get('titan.computeUnitPrice'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}

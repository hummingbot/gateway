import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace DFlowConfig {
  // DFlow's aggregator API serves Solana mainnet only
  export const chain = 'solana';
  export const networks = ['mainnet-beta'];
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['router'] as const;

  export interface RootConfig {
    slippagePct: number;
    apiKey?: string;
    computeUnitPriceMicroLamports: number;
    dynamicComputeUnitLimit: boolean;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('dflow.slippagePct'),
    apiKey: ConfigManagerV2.getInstance().get('dflow.apiKey'),
    computeUnitPriceMicroLamports: ConfigManagerV2.getInstance().get('dflow.computeUnitPriceMicroLamports'),
    dynamicComputeUnitLimit: ConfigManagerV2.getInstance().get('dflow.dynamicComputeUnitLimit'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}

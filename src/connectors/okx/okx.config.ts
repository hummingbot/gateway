import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace OkxConfig {
  // The OKX DEX aggregator connector targets Solana mainnet (chainIndex 501)
  export const chain = 'solana';
  export const networks = ['mainnet-beta'];
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['router'] as const;

  export interface RootConfig {
    slippagePct: number;
    apiKey?: string;
    secretKey?: string;
    passphrase?: string;
    computeUnitPrice: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('okx.slippagePct'),
    apiKey: ConfigManagerV2.getInstance().get('okx.apiKey'),
    secretKey: ConfigManagerV2.getInstance().get('okx.secretKey'),
    passphrase: ConfigManagerV2.getInstance().get('okx.passphrase'),
    computeUnitPrice: ConfigManagerV2.getInstance().get('okx.computeUnitPrice'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}

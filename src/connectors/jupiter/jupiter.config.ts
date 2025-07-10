import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace JupiterConfig {
  // Supported networks for Jupiter
  export const chain = 'solana';
  export const networks = ['mainnet-beta', 'devnet'];

  export interface RootConfig {
    // Global configuration
    slippagePct: number;
    priorityLevel: string;
    maxLamports: number;
    apiKey?: string;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('jupiter.slippagePct'),
    priorityLevel: ConfigManagerV2.getInstance().get('jupiter.priorityLevel'),
    maxLamports: ConfigManagerV2.getInstance().get('jupiter.maxLamports'),
    apiKey: ConfigManagerV2.getInstance().get('jupiter.apiKey'),

    availableNetworks: [
      {
        chain,
        networks,
      },
    ],
  };

  // Example configurations for route schemas
  export const examples = {
    network: networks[0], // 'mainnet-beta'
    baseToken: 'SOL',
    quoteToken: 'USDC',
    amount: 1,
    side: 'SELL' as const,
    slippagePct: config.slippagePct,
    priorityLevel: config.priorityLevel,
    maxLamports: config.maxLamports,
    quoteId: '123e4567-e89b-12d3-a456-426614174000',
  };
}

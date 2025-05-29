import { ConfigManagerV2 } from '../../services/config-manager-v2';

interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

export namespace JupiterConfig {
  // Supported networks for Jupiter
  export const chain = 'solana';
  export const networks = ['mainnet-beta', 'devnet'];

  export interface NetworkConfig {
    allowedSlippage: string;
    priorityLevel: string;
    apiKey?: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'jupiter.allowedSlippage',
    ),
    priorityLevel: ConfigManagerV2.getInstance().get('jupiter.priorityLevel'),
    apiKey: ConfigManagerV2.getInstance().get('jupiter.apiKey'),
    tradingTypes: ['swap'],
    availableNetworks: [
      { chain: 'solana', networks: ['mainnet-beta', 'devnet'] },
    ],
  };
}

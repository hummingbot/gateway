import { ConfigManagerV2 } from '../../services/config-manager-v2';

interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

export namespace JupiterConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    priorityLevel: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'jupiter.allowedSlippage',
    ),
    priorityLevel: ConfigManagerV2.getInstance().get('jupiter.priorityLevel'),
    tradingTypes: ['swap'],
    availableNetworks: [
      { chain: 'solana', networks: ['mainnet-beta', 'devnet'] },
    ],
  };
}

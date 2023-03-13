import { AvailableNetworks } from '../../services/config-manager-types';

export namespace ZigZagConfig {
  export interface NetworkConfig {
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    availableNetworks: [
      {
        chain: 'ethereum',
        networks: ['arbitrum_mainnet', 'arbitrum_goerli'],
      },
    ],
  };
}

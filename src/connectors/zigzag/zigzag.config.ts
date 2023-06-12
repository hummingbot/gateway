import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace ZigZagConfig {
  export interface NetworkConfig {
    contractAddress: (network: string) => string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    contractAddress: (network: string) =>
      ConfigManagerV2.getInstance().get(
        `zigzag.networks.${network}.contractAddress`
      ),
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    availableNetworks: [
      {
        chain: 'ethereum',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('zigzag.networks')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('ethereum.networks')
          ).includes(network)
        ),
      },
    ],
  };
}

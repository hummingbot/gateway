import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace TinymanConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'tinyman.allowedSlippage'
    ),
    tradingTypes: ['EVM_AMM'],
    availableNetworks: [
      { chain: 'algorand', networks: ['mainnet', 'testnet'] },
    ],
  };
}

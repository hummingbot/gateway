import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

/**
 * To-do: Update.
 */
export namespace TinymanConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'tinyman.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'tinyman.gasLimitEstimate'
    ),
    ttl: ConfigManagerV2.getInstance().get('tinyman.ttl'),
    tradingTypes: ['EVM_AMM'],
    availableNetworks: [{ chain: 'algorand', networks: ['mainnet'] }],
  };
}

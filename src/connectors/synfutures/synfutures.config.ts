import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';
export namespace SynFuturesConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    ttl: number;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(`synfutures.allowedSlippage`),
    ttl: ConfigManagerV2.getInstance().get(`synfutures.versions.ttl`),
    tradingTypes: ['AMM_Perpetual'],
    chainType: 'EVM',
    availableNetworks: [{ chain: 'ethereum', networks: ['blast'] }],
  };
}

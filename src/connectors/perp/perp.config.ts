import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';
export namespace PerpConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    ttl: number;
    tradingTypes: (type: string) => Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(`perp.allowedSlippage`),
    ttl: ConfigManagerV2.getInstance().get(`perp.versions.ttl`),
    tradingTypes: (type: string) =>
      type === 'perp' ? ['AMM_Perpetual'] : ['AMM_LP'],
    chainType: 'EVM',
    availableNetworks: [{ chain: 'ethereum', networks: ['optimism'] }],
  };
}

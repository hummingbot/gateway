import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace JupiterswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'tinyman.allowedSlippage',
    ),
    tradingTypes: ['AMM'],
    chainType: 'SOLANA',
    availableNetworks: [{ chain: 'solana', networks: ['mainnet'] }],
  };
}

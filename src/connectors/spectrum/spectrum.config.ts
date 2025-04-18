import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { NetworkConfig } from './interfaces/spectrum.interface';

const configManager = ConfigManagerV2.getInstance();

export namespace SpectrumConfig {
  export const config: NetworkConfig = {
    allowedSlippage: configManager.get('spectrum.allowedSlippage'),
    gasLimitEstimate: configManager.get('spectrum.gasLimitEstimate'),
    tradingTypes: ['AMM'],
    chainType: 'ERGO',
    availableNetworks: [{ chain: 'ergo', networks: ['mainnet'] }],
  };
}

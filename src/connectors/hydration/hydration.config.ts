import {AvailableNetworks} from '../connector.requests';
import {ConfigManagerV2} from '../../services/config-manager-v2';

export namespace HydrationConfig {
  export interface NetworkConfig {
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    feePaymentCurrencySymbol: string;
    allowedSlippage: string;
  }

  const configManager = ConfigManagerV2.getInstance();

  export const config: NetworkConfig = {
    availableNetworks: [{ chain: 'polkadot', networks: ['mainnet'] }],
    tradingTypes: ['AMM'],
    feePaymentCurrencySymbol: configManager.get('hydration.feePaymentCurrencySymbol'),
    allowedSlippage: configManager.get('hydration.allowedSlippage'),
  };
}


import {AvailableNetworks} from '../connector.interfaces';
import {ConfigManagerV2} from '../../services/config-manager-v2';

/**
 * Configuration namespace for Hydration service.
 * Contains network configuration settings and initialization.
 */
export namespace HydrationConfig {
  /**
   * Network configuration interface for Hydration service.
   * Defines the structure of network-specific settings.
   */
  export interface NetworkConfig {
    /** Supported trading types (e.g., AMM) */
    tradingTypes: Array<string>;
    
    /** Available blockchain networks */
    availableNetworks: Array<AvailableNetworks>;
    
    /** Symbol of the currency used for fee payment */
    feePaymentCurrencySymbol: string;
    
    /** Default allowed slippage percentage */
    allowedSlippage: string;
  }

  const configManager = ConfigManagerV2.getInstance();

  /**
   * Default configuration for Hydration service.
   * Contains network settings and default values.
   */
  export const config: NetworkConfig = {
    availableNetworks: [{ chain: 'polkadot', networks: ['mainnet'] }],
    tradingTypes: ['AMM'],
    feePaymentCurrencySymbol: configManager.get('hydration.feePaymentCurrencySymbol'),
    allowedSlippage: configManager.get('hydration.allowedSlippage'),
  };
}


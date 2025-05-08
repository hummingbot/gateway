import {TokenListType} from '../../services/base';
import {ConfigManagerV2} from '../../services/config-manager-v2';

/**
 * Configuration for a Polkadot network
 */
interface NetworkConfig {
  /** URL of the Polkadot node RPC endpoint */
  nodeURL: string;
  /** URL for transaction lookup service */
  transactionURL: string;
  /** Type of token list source (URL or FILE) */
  tokenListType: TokenListType;
  /** Location of the token list (URL or file path) */
  tokenListSource: string;
  /** Symbol of the native currency (e.g., DOT, KSM) */
  nativeCurrencySymbol: string;
  /** Symbol of the fee payment currency (e.g., DOT, KSM) */
  feePaymentCurrencySymbol: string;
}

/**
 * Complete Polkadot configuration
 */
export interface Config {
  /** Network-specific configuration */
  network: NetworkConfig;
}

/**
 * Retrieves the configuration for a specified Polkadot network
 * 
 * @param chainName The name of the chain (e.g., 'polkadot')
 * @param networkName The name of the network (e.g., 'mainnet', 'westend')
 * @returns Configuration object for the specified network
 */
export function getPolkadotConfig(
  chainName: string,
  networkName: string
): Config {
  const configManager = ConfigManagerV2.getInstance();
  const prefix = `${chainName}.networks.${networkName}`;

  return {
    network: {
      nodeURL: configManager.get(`${prefix}.nodeURL`),
      transactionURL: configManager.get(`${prefix}.transactionURL`),
      tokenListType: configManager.get(`${prefix}.tokenListType`),
      tokenListSource: configManager.get(`${prefix}.tokenListSource`),
      nativeCurrencySymbol: configManager.get(`${prefix}.nativeCurrencySymbol`),
      feePaymentCurrencySymbol: configManager.get(`${prefix}.feePaymentCurrencySymbol`),
    }
  };
}


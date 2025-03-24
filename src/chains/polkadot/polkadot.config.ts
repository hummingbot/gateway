import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

interface NetworkConfig {
  nodeURL: string;
  transactionUrl: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  nativeCurrencySymbol: string;
  feePaymentCurrencySymbol: string;
}

export interface Config {
  network: NetworkConfig;
}

export function getPolkadotConfig(
  chainName: string,
  networkName: string
): Config {
  const configManager = ConfigManagerV2.getInstance();
  
  // Get the active parachain for this network
  const activeParachain = configManager.get(
    `${chainName}.networks.${networkName}.parachain`
  );
    
  return {
    network: {
      nodeURL: configManager.get(`${activeParachain}.nodeURL`),
      transactionUrl: configManager.get(`${activeParachain}.transactionUrl`),
      tokenListType: configManager.get(`${activeParachain}.tokenListType`),
      tokenListSource: configManager.get(`${activeParachain}.tokenListSource`),
      nativeCurrencySymbol: configManager.get(`${activeParachain}.nativeCurrencySymbol`),
      feePaymentCurrencySymbol: configManager.get(`${activeParachain}.feePaymentCurrencySymbol`),
    }
  };
}


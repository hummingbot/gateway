import {TokenListType} from '../../services/base';
import {ConfigManagerV2} from '../../services/config-manager-v2';

interface NetworkConfig {
  nodeURL: string;
  transactionURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  nativeCurrencySymbol: string;
}

export interface Config {
  network: NetworkConfig;
}

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
    }
  };
}


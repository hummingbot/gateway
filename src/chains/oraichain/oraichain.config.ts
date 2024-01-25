import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
export interface NetworkConfig {
  name: string;
  rpcURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  marketListType: string;
  marketListSource: string;
}

export interface Config {
  network: NetworkConfig;
  nativeCurrencySymbol: string;
  manualGasPrice: number;
}

export namespace OraichainConfig {
  export const config: Config = getOraichainConfig('oraichain', 'mainnet');
}

export function getOraichainConfig(
  chainName: string,
  networkName: string
): Config {
  const configManager = ConfigManagerV2.getInstance();
  return {
    network: {
      name: networkName,
      rpcURL: configManager.get(
        chainName + '.networks.' + networkName + '.nodeURL'
      ),
      tokenListType: configManager.get(
        chainName + '.networks.' + networkName + '.tokenListType'
      ),
      tokenListSource: configManager.get(
        chainName + '.networks.' + networkName + '.tokenListSource'
      ),
      marketListType: configManager.get(
        chainName + '.networks.' + networkName + '.marketListType'
      ),
      marketListSource: configManager.get(
        chainName + '.networks.' + networkName + '.marketListSource'
      ),
    },
    nativeCurrencySymbol: configManager.get(
      chainName + '.nativeCurrencySymbol'
    ),
    manualGasPrice: configManager.get(chainName + '.manualGasPrice'),
  };
}

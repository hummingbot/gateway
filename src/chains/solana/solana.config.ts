import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
interface NetworkConfig {
  name: string;
  nodeURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  nativeCurrencySymbol: string;
  maxLRUCacheInstances: number;
}

export interface Config {
  network: NetworkConfig;
  tokenProgram: string;
  transactionLamports: number;
  lamportsToSol: number;
  timeToLive: number;
}

export function getSolanaConfig(
  chainName: string,
  networkName: string
): Config {
  return {
    network: {
      name: networkName,
      nodeURL: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.nodeURL'
      ),
      tokenListType: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.tokenListType'
      ),
      tokenListSource: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.tokenListSource'
      ),
      nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.nativeCurrencySymbol'
      ),
      maxLRUCacheInstances: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.maxLRUCacheInstances'
      ),
    },
    tokenProgram: ConfigManagerV2.getInstance().get(
      chainName + '.tokenProgram'
    ),
    transactionLamports: ConfigManagerV2.getInstance().get(
      chainName + '.transactionLamports'
    ),
    lamportsToSol: ConfigManagerV2.getInstance().get(
      chainName + '.lamportsToSol'
    ),
    timeToLive: ConfigManagerV2.getInstance().get(chainName + '.timeToLive'),
  };
}

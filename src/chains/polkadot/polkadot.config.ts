import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

interface NetworkConfig {
  nodeURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  nativeCurrencySymbol: string;
  ss58Format: number; // Polkadot-specific: SS58 address format
  chainId?: number; // ID da rede para compatibilidade com TokenInfo
}

export interface Config {
  network: NetworkConfig;
  defaultTransactionTimeout: number;
  batchTxLimit: number; // Polkadot-specific: max number of transactions in a batch
}

export function getPolkadotConfig(
  chainName: string,
  networkName: string
): Config {
  return {
    network: {
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
      ss58Format: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.ss58Format'
      ),
      chainId: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.chainId'
      ) || 0,
    },
    defaultTransactionTimeout: ConfigManagerV2.getInstance().get(
      chainName + '.defaultTransactionTimeout'
    ),
    batchTxLimit: ConfigManagerV2.getInstance().get(
      chainName + '.batchTxLimit'
    ),
  };
}


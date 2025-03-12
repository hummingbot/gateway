import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

interface NetworkConfig {
  name: string;
  nodeURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  nativeCurrencySymbol: string;
  ss58Format: number; // Polkadot-specific: SS58 address format
}

export interface Config {
  network: NetworkConfig;
  retryIntervalMs: number;
  retryCount: number;
  defaultExistentialDeposit: string; // Polkadot-specific: min balance to avoid being reaped
  defaultTransactionTimeout: number;
  defaultTransactionFeeMultiplier: number;
  defaultTipValue: string; // Polkadot-specific: default tip value
  batchTxLimit: number; // Polkadot-specific: max number of transactions in a batch
}

export function getPolkadotConfig(
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
      ss58Format: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.ss58Format'
      ),
    },
    retryIntervalMs: ConfigManagerV2.getInstance().get(
      chainName + '.retryIntervalMs'
    ),
    retryCount: ConfigManagerV2.getInstance().get(
      chainName + '.retryCount'
    ),
    defaultExistentialDeposit: ConfigManagerV2.getInstance().get(
      chainName + '.defaultExistentialDeposit'
    ),
    defaultTransactionTimeout: ConfigManagerV2.getInstance().get(
      chainName + '.defaultTransactionTimeout'
    ),
    defaultTransactionFeeMultiplier: ConfigManagerV2.getInstance().get(
      chainName + '.defaultTransactionFeeMultiplier'
    ),
    defaultTipValue: ConfigManagerV2.getInstance().get(
      chainName + '.defaultTipValue'
    ),
    batchTxLimit: ConfigManagerV2.getInstance().get(
      chainName + '.batchTxLimit'
    ),
  };
}


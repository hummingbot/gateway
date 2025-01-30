import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
interface NetworkConfig {
  name: string;
  nodeURL: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  nativeCurrencySymbol: string;
}

export interface Config {
  network: NetworkConfig;
  defaultComputeUnits: number;
  basePriorityFeePct: number;
  priorityFeeMultiplier: number;
  maxPriorityFee: number;
  minPriorityFee: number;
  retryIntervalMs: number;
  retryCount: number;
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
    },
    defaultComputeUnits: ConfigManagerV2.getInstance().get(
      chainName + '.defaultComputeUnits'
    ),
    basePriorityFeePct: ConfigManagerV2.getInstance().get(
      chainName + '.basePriorityFeePct'
    ),
    priorityFeeMultiplier: ConfigManagerV2.getInstance().get(
      chainName + '.priorityFeeMultiplier'
    ),
    maxPriorityFee: ConfigManagerV2.getInstance().get(
      chainName + '.maxPriorityFee'
    ),
    minPriorityFee: ConfigManagerV2.getInstance().get(
      chainName + '.minPriorityFee'
    ),
    retryIntervalMs: ConfigManagerV2.getInstance().get(
      chainName + '.retryIntervalMs'
    ),
    retryCount: ConfigManagerV2.getInstance().get(
      chainName + '.retryCount'
    ),
  };
}

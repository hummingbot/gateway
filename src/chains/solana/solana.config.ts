import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
interface NetworkConfig {
  name: string;
  nodeURLs: string;
  tokenListType: TokenListType;
  tokenListSource: string;
  nativeCurrencySymbol: string;
}

export interface Config {
  network: NetworkConfig;
  defaultComputeUnits: number;
  priorityFeePercentile: number;
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
      nodeURLs: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.nodeURLs'
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
    priorityFeePercentile: ConfigManagerV2.getInstance().get(
      chainName + '.priorityFeePercentile'
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

import { TokenListType } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { rootPath } from '../../paths';
import path from 'path';

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
  gasEstimateInterval: number;
  maxFee: number;
  minFee: number;
  retryCount: number;
  retryFeeMultiplier: number;
  retryInterval: number;
  confirmRetryInterval: number;
  confirmRetryCount: number;
  basePriorityFeePct: number;
}

export function getSolanaConfig(
  chainName: string,
  networkName: string,
): Config {
  return {
    network: {
      name: networkName,
      nodeURL: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.nodeURL',
      ),
      tokenListType: 'FILE' as TokenListType,
      tokenListSource: path.join(
        rootPath(),
        'conf',
        'tokens',
        chainName,
        `${networkName}.json`
      ),
      nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.nativeCurrencySymbol',
      ),
    },
    defaultComputeUnits: ConfigManagerV2.getInstance().get(
      chainName + '.defaultComputeUnits',
    ),
    gasEstimateInterval: ConfigManagerV2.getInstance().get(
      chainName + '.gasEstimateInterval',
    ),
    maxFee: ConfigManagerV2.getInstance().get(
      chainName + '.maxFee',
    ),
    minFee: ConfigManagerV2.getInstance().get(
      chainName + '.minFee',
    ),
    retryCount: ConfigManagerV2.getInstance().get(chainName + '.retryCount'),
    retryFeeMultiplier: ConfigManagerV2.getInstance().get(
      chainName + '.retryFeeMultiplier',
    ),
    retryInterval: ConfigManagerV2.getInstance().get(
      chainName + '.retryInterval',
    ),
    confirmRetryInterval: ConfigManagerV2.getInstance().get(
      chainName + '.confirmRetryInterval',
    ),
    confirmRetryCount: ConfigManagerV2.getInstance().get(
      chainName + '.confirmRetryCount',
    ),
    basePriorityFeePct: ConfigManagerV2.getInstance().get(
      chainName + '.basePriorityFeePct',
    ),
  };
}

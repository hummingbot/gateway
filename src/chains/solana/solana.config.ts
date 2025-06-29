import path from 'path';

import { rootPath } from '../../paths';
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
  const namespaceId = `${chainName}-${networkName}`;
  return {
    network: {
      name: networkName,
      nodeURL: ConfigManagerV2.getInstance().get(namespaceId + '.nodeURL'),
      tokenListType: 'FILE' as TokenListType,
      tokenListSource: path.join(
        rootPath(),
        'conf',
        'tokens',
        chainName,
        `${networkName}.json`,
      ),
      nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
        namespaceId + '.nativeCurrencySymbol',
      ),
    },
    defaultComputeUnits: ConfigManagerV2.getInstance().get(
      namespaceId + '.defaultComputeUnits',
    ),
    gasEstimateInterval: ConfigManagerV2.getInstance().get(
      namespaceId + '.gasEstimateInterval',
    ),
    maxFee: ConfigManagerV2.getInstance().get(namespaceId + '.maxFee'),
    minFee: ConfigManagerV2.getInstance().get(namespaceId + '.minFee'),
    retryCount: ConfigManagerV2.getInstance().get(namespaceId + '.retryCount'),
    retryFeeMultiplier: ConfigManagerV2.getInstance().get(
      namespaceId + '.retryFeeMultiplier',
    ),
    retryInterval: ConfigManagerV2.getInstance().get(
      namespaceId + '.retryInterval',
    ),
    confirmRetryInterval: ConfigManagerV2.getInstance().get(
      namespaceId + '.confirmRetryInterval',
    ),
    confirmRetryCount: ConfigManagerV2.getInstance().get(
      namespaceId + '.confirmRetryCount',
    ),
    basePriorityFeePct: ConfigManagerV2.getInstance().get(
      namespaceId + '.basePriorityFeePct',
    ),
  };
}

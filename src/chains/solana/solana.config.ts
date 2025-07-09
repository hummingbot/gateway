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

import { ConfigManagerV2 } from '../../services/config-manager-v2';
export interface NetworkConfig {
  name: string;
  apiurl: string;
}

export interface Config {
  network: NetworkConfig;
  allowedSlippage: string;
  blockfrostProjectId: string;
  preprodBlockfrostProjectId: string;
  previewBlockfrostProjectId: string;
  ttl: string;
  minswapPoolId: string;
  sundaeswapPoolId: string;
  defaultAddress: string;
  nativeCurrencySymbol: string;
  tokenListType: string; // default: FILE
  tokenListSource: string; // default: src/chains/cardano/cardano_tokens.json
}

export function getCardanoConfig(
  chainName: string,
  networkName: string,
): Config {
  const network = networkName;
  return {
    network: {
      name: network,
      apiurl: ConfigManagerV2.getInstance().get(
        chainName + '.blockfrostApiUrls.' + networkName + '.apiurl',
      ),
    },

    allowedSlippage: ConfigManagerV2.getInstance().get(
      chainName + '.allowedSlippage',
    ),
    blockfrostProjectId: ConfigManagerV2.getInstance().get(
      chainName + '.blockfrostProjectId',
    ),
    preprodBlockfrostProjectId: ConfigManagerV2.getInstance().get(
      chainName + '.preprodBlockfrostProjectId',
    ),
    previewBlockfrostProjectId: ConfigManagerV2.getInstance().get(
      chainName + '.previewBlockfrostProjectId',
    ),
    minswapPoolId: ConfigManagerV2.getInstance().get(
      chainName + '.minswapPoolId.' + networkName + '.poolId',
    ),
    sundaeswapPoolId: ConfigManagerV2.getInstance().get(
      chainName + '.sundaeswapPoolId.' + networkName + '.poolId',
    ),
    defaultAddress: ConfigManagerV2.getInstance().get(
      chainName + '.defaultAddress',
    ),
    ttl: ConfigManagerV2.getInstance().get(chainName + '.ttl'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
      chainName + '.networks.' + networkName + '.nativeCurrencySymbol',
    ),
    tokenListType: ConfigManagerV2.getInstance().get(
      chainName + '.networks.' + networkName + '.tokenListType',
    ),
    tokenListSource: ConfigManagerV2.getInstance().get(
      chainName + '.networks.' + networkName + '.tokenListSource',
    ),
  };
}

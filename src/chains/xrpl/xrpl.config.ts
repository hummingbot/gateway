import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface NetworkConfig {
  name: string;
  nodeUrl: string; // example: wss://xrplcluster.com/
  tokenListType: string; // default: FILE
  tokenListSource: string; // default: src/chains/xrpl/xrpl_tokens.json
  marketListType: string; // default: FILE
  marketListSource: string; // default: src/chains/xrpl/xrpl_markets.json
  nativeCurrencySymbol: string; // XRP
  maxLRUCacheInstances: number;
}

export interface Config {
  // "mainnet" | "testnet" | "devnet"
  network: NetworkConfig;
  requestTimeout: number; // default: 20
  connectionTimeout: number; // default: 5
  feeCushion: number; // default: 1.2
  maxFeeXRP: string; // default: 2
  orderDbPath: string;
}

// @todo: find out which configs are required
export function getXRPLConfig(chainName: string, networkName: string): Config {
  const configManager = ConfigManagerV2.getInstance();
  return {
    network: {
      name: networkName,
      nodeUrl: configManager.get(
        chainName + '.networks.' + networkName + '.nodeURL'
      ),
      tokenListType: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.tokenListType'
      ),
      tokenListSource: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.tokenListSource'
      ),
      marketListType: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.marketListType'
      ),
      marketListSource: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.marketListSource'
      ),
      nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.nativeCurrencySymbol'
      ),
      maxLRUCacheInstances: ConfigManagerV2.getInstance().get(
        chainName + '.maxLRUCacheInstances'
      ),
    },
    requestTimeout: ConfigManagerV2.getInstance().get(
      chainName + '.requestTimeout'
    ),
    connectionTimeout: ConfigManagerV2.getInstance().get(
      chainName + '.connectionTimeout'
    ),
    feeCushion: ConfigManagerV2.getInstance().get(chainName + '.feeCushion'),
    maxFeeXRP: ConfigManagerV2.getInstance().get(chainName + '.maxFeeXRP'),
    orderDbPath: ConfigManagerV2.getInstance().get(chainName + '.orderDbPath'),
  };
}

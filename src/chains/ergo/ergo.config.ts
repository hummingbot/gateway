import {ConfigManagerV2} from "../../services/config-manager-v2";
import {NetworkPrefix} from "ergo-lib-wasm-nodejs";


export interface NetworkConfig {
  name: string;
  nodeURL: string;
  timeOut: number;
  networkPrefix: NetworkPrefix;
  minTxFee: number;
  maxLRUCacheInstances: number;
}
export interface Config {
  network: NetworkConfig;
}
export function getErgoConfig(network: string): Config {
  return {
    network: {
      name: network,
      nodeURL: ConfigManagerV2.getInstance().get(
        'algorand.networks.' + network + '.nodeURL'
      ),
      timeOut: ConfigManagerV2.getInstance().get(
        'ergo.networks.' + network + '.timeOut'
      ),
      networkPrefix: network === "Mainnet" ? NetworkPrefix.Mainnet : NetworkPrefix.Testnet,
      minTxFee: ConfigManagerV2.getInstance().get(
        'algorand.networks.' + network + '.minTxFee'
      ),
      maxLRUCacheInstances: 10
    },
  };
}
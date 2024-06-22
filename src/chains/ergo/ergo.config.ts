import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { ErgoConfig } from './interfaces/ergo.interface';

/**
 *  This function return configuration for Ergo
 * @param {string} network - mainnet or testnet
 * @returns ErgoConfig
 * @function
 */
export function getErgoConfig(network: string): ErgoConfig {
  return {
    network: {
      name: network,
      nodeURL: ConfigManagerV2.getInstance().get(
        'ergo.networks.' + network + '.nodeURL',
      ),
      explorerURL: ConfigManagerV2.getInstance().get(
        'ergo.networks.' + network + '.explorerURL',
      ),
      explorerDEXURL: ConfigManagerV2.getInstance().get(
        'ergo.networks.' + network + '.explorerDEXURL',
      ),
      timeOut: ConfigManagerV2.getInstance().get(
        'ergo.networks.' + network + '.timeOut',
      ),
      networkPrefix:
        network === 'Mainnet' ? NetworkPrefix.Mainnet : NetworkPrefix.Testnet,
      minTxFee: ConfigManagerV2.getInstance().get(
        'ergo.networks.' + network + '.minTxFee',
      ),
      maxLRUCacheInstances: 10,
      utxosLimit: 100,
      poolLimit: 100,
      defaultSlippage: 3,
      defaultMinerFee: BigInt(2_000_000),
      minNitro: 1.2,
      minBoxValue: BigInt(400_000),
    },
  };
}

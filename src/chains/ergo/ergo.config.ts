import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { ErgoConfig } from './interfaces/ergo.interface';
import { ErgoNetwork } from './types/ergo.type';

/**
 *  This function return configuration for Ergo
 * @param {string} network - mainnet or testnet
 * @returns ErgoConfig
 * @function
 */
export function getErgoConfig(network: ErgoNetwork): ErgoConfig {
  const configManager = ConfigManagerV2.getInstance();

  return {
    network: {
      name: network,
      nodeURL: configManager.get(`ergo.networks.${network}.nodeURL`),
      explorerURL: configManager.get(`ergo.networks.${network}.explorerURL`),
      explorerDEXURL: configManager.get(
        `ergo.networks.${network}.explorerDEXURL`,
      ),
      timeOut: configManager.get(`ergo.networks.${network}.timeOut`),
      networkPrefix:
        network === 'mainnet' ? NetworkPrefix.Mainnet : NetworkPrefix.Testnet,
      minTxFee: configManager.get(`ergo.networks.${network}.minTxFee`),
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

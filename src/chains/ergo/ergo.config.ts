import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { ErgoConfig } from './interfaces/ergo.interface';
import { ErgoNetwork } from './types/ergo.type';
import { BigNumber } from 'bignumber.js';

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
      maxLRUCacheInstances: configManager.get(
        `ergo.networks.${network}.maxLRUCacheInstances`,
      ),
      utxosLimit: configManager.get(`ergo.networks.${network}.utxosLimit`),
      poolLimit: configManager.get(`ergo.networks.${network}.poolLimit`),
      defaultSlippage: configManager.get(
        `ergo.networks.${network}.defaultSlippage`,
      ),
      defaultMinerFee: BigNumber(
        configManager.get(`ergo.networks.${network}.defaultMinerFee`),
      ),
      minNitro: configManager.get(`ergo.networks.${network}.minNitro`),
      minBoxValue: BigNumber(
        configManager.get(`ergo.networks.${network}.minBoxValue`),
      ),
    },
  };
}

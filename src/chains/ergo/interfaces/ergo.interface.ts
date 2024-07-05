import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { Wallet } from 'ergo-lib-wasm-nodejs';
import { Ergo } from '../ergo';
import { AssetAmount } from '@patternglobal/ergo-sdk';
import { WalletProver } from '../wallet-prover.service';
import { BigNumber } from 'bignumber.js';

export interface ErgoNetworkConfig {
  name: string;
  nodeURL: string;
  explorerURL: string;
  explorerDEXURL: string;
  timeOut: number;
  networkPrefix: NetworkPrefix;
  minTxFee: number;
  maxLRUCacheInstances: number;
  utxosLimit: number;
  poolLimit: number;
  defaultSlippage: number;
  defaultMinerFee: BigNumber;
  minNitro: number;
  minBoxValue: BigNumber;
}
export interface ErgoConfig {
  network: ErgoNetworkConfig;
}

export interface ErgoAsset {
  tokenId: string;
  decimals: number;
  name: string;
  symbol: string;
}

export interface ErgoAccount {
  wallet: Wallet;
  address: string;
  prover: WalletProver;
}

export interface ErgoConnectedInstance {
  [name: string]: Ergo;
}

export interface ErgoBoxAsset {
  tokenId: string;
  amount: BigNumber;
}

export interface ErgoBox {
  boxId: string;
  value: BigNumber;
  ergoTree: string;
  creationHeight: number;
  assets: Array<ErgoBoxAsset>;
  additionalRegisters: {
    R4: string;
  };
  transactionId: string;
  index: number;
  address: string;
  spentTransactionId: string;
  spendingHeight: number;
  inclusionHeight: number;
  globalIndex: number;
}

export interface BaseInputParameters {
  baseInput: AssetAmount;
  baseInputAmount: BigNumber;
  minOutput: AssetAmount;
}

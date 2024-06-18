import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { Wallet } from 'ergo-lib-wasm-nodejs';
import { Ergo } from '../ergo';

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
}

export interface ErgoConnectedInstance {
  [name: string]: Ergo;
}

export interface ErgoBoxAsset {
  tokenId: string;
  amount: number;
}

export interface ErgoBox {
  boxId: string;
  value: number;
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

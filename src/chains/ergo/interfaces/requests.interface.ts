import { AssetAmount, ErgoTx } from '@patternglobal/ergo-sdk';
import { NetworkSelectionRequest } from '../../../services/common-interfaces';
import { ErgoAsset, ErgoBoxAsset } from './ergo.interface';

export interface PoolRequest {
  network: string;
  poolId: string;
}

export interface PoolResponse {
  id: string;
  lp: AssetAmount;
  x: AssetAmount;
  y: AssetAmount;
  feeNum: bigint;
  feeDenom: bigint;
}

export interface PollResponse extends ErgoTx {}
export interface PollRequest {
  txId: string;
}

export interface BalanceRequest extends NetworkSelectionRequest {
  address: string; // the users public key
}

export interface AssetsResponse {
  assets: ErgoAsset[];
}

export interface TransferRequest {
  fromAddress: string;
  toAddress: string;
  assets: ErgoBoxAsset[];
  toValue: string;
}

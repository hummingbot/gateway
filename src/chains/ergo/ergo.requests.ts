import { AssetAmount } from '@patternglobal/ergo-sdk';
import { NetworkSelectionRequest } from '../../services/common-interfaces';
import { ErgoAsset, ErgoBoxAsset } from './interfaces/ergo.interface';

export interface PoolRequest {
  network: string;
  poolId: string;
}

export type PoolResponse = {
  id: string;
  lp: AssetAmount;
  x: AssetAmount;
  y: AssetAmount;
  feeNum: bigint;
  feeDenom: bigint;
};

export interface BalanceRequest extends NetworkSelectionRequest {
  address: string; // the users public key
}

export type AssetsResponse = {
  assets: ErgoAsset[];
};

export type transferRequest = {
  fromAddress: string;
  toAddress: string;
  assets: ErgoBoxAsset[];
  toValue: string;
};

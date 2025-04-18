import {TokenInfo} from '../ethereum/ethereum-base';
import {KeyringPair} from '@polkadot/keyring/types';
import {SubmittableExtrinsic} from '@polkadot/api/types';
import {ISubmittableResult} from '@polkadot/types/types';

export interface PolkadotAccount {
  address: string;
  publicKey: string;
  keyringPair?: KeyringPair;
}

export enum TransactionStatus {
  NOT_FOUND = 0,
  PENDING = 1,
  SUCCESS = 2,
  FAILED = 3,
}

export interface FeeEstimate {
  estimatedFee: string;
  partialFee: string;
  weight: string;
}

export interface SubmittableTransaction {
  tx: SubmittableExtrinsic<'promise', ISubmittableResult>;
  feeEstimate: FeeEstimate;
}

export interface TransactionReceipt {
  blockHash: string;
  blockNumber: number;
  events: any[];
  status: TransactionStatus;
  transactionHash: string;
  fee?: string;
}

export interface TransferOptions {
  tip?: string;
  keepAlive?: boolean;
  waitForFinalization?: boolean;
  timeout?: number;
}

// Polkadot-specific staking types
export interface StakingInfo {
  totalStake: string;
  ownStake: string;
  rewardDestination: string;
  nominators: Array<{
    address: string;
    value: string;
  }>;
  validators: Array<{
    address: string;
    value: string;
    commission: string;
  }>;
}

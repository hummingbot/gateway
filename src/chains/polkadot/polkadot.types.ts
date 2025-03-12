import { TokenInfo } from '../ethereum/ethereum-base';
import { ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ISubmittableResult } from '@polkadot/types/types';

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

export interface TransactionDetails {
  hash: string;
  blockHash?: string;
  blockNumber?: number;
  status: TransactionStatus;
  events?: any[];
  error?: string;
  fee?: number;
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

export interface TokenBalance {
  token: TokenInfo;
  balance: string;
  freeBalance: string;
  reservedBalance?: string;
  frozenBalance?: string;
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

export interface BatchTransactionOptions extends TransferOptions {
  atomicBatch?: boolean; // true for batch.all (atomic), false for batch (non-atomic)
}

export interface DelegateOptions extends TransferOptions {
  proxyType?: string; // The type of proxy to delegate
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

// Polkadot-specific types for parachain operations
export interface ParachainInfo {
  id: number;
  name: string;
  status: string;
}

export interface PolkadotPalletMetadata {
  name: string;
  storage: string[];
  calls: string[];
  events: string[];
  constants: string[];
}

export interface PolkadotRuntimeMetadata {
  pallets: PolkadotPalletMetadata[];
  extrinsics: string[];
}


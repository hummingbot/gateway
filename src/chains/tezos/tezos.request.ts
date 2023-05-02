import { OperationContents, OperationContentsAndResult } from '@taquito/rpc';
import {
  CustomTransaction,
  NetworkSelectionRequest,
} from '../../services/common-interfaces';
import { TransactionResponse } from './tzkt.api.client';

export interface NonceRequest extends NetworkSelectionRequest {
  address: string;
}
export interface NonceResponse {
  nonce: number;
}

export interface BalanceRequest extends NetworkSelectionRequest {
  address: string;
  tokenSymbols: string[];
}

export interface BalanceResponse {
  network: string;
  timestamp: number;
  latency: number;
  balances: Record<string, string>;
}

export interface AllowancesRequest extends NetworkSelectionRequest {
  address: string;
  spender: string;
  tokenSymbols: string[];
}

export interface PollRequest extends NetworkSelectionRequest {
  txHash: string;
}

export interface PollResponse {
  network: string;
  timestamp: number;
  currentBlock: number;
  txHash: string;
  txStatus: number;
  txData: (OperationContents | OperationContentsAndResult | TransactionResponse)[] | null;
}

export interface AllowancesResponse {
  network: string;
  timestamp: number;
  latency: number;
  spender: string;
  approvals: Record<string, string>;
}

export interface ApproveRequest extends NetworkSelectionRequest {
  amount?: string;
  nonce?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  address: string;
  spender: string;
  token: string;
}

export interface ApproveResponse {
  network: string;
  timestamp: number;
  latency: number;
  tokenAddress: string;
  spender: string;
  amount: string;
  nonce: number;
  approval: CustomTransaction;
}
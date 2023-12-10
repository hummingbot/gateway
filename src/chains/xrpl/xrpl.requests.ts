import { NetworkSelectionRequest } from '../../services/common-interfaces';
import { TxResponse } from 'xrpl';

export interface XRPLBalanceRequest extends NetworkSelectionRequest {
  address: string;
  tokenSymbols: string[];
}

export interface XRPLBalanceResponse {
  network: string;
  timestamp: number;
  latency: number;
  address: string;
  balances: Record<string, BalanceRecord>;
}

export interface BalanceRecord {
  total_balance: string;
  available_balance: string;
}

export type TokenBalance = {
  currency: string;
  issuer?: string;
  value: string;
};

export interface XRPLTokenRequest extends NetworkSelectionRequest {
  address: string; // the user's Solana address as Base58
  token: string; // the token symbol the spender will be approved for
}

export interface XRPLTokenResponse {
  network: string;
  timestamp: number;
  token: string; // the token symbol the spender will be approved for
  mintAddress: string;
  accountAddress?: string;
  amount: string | null;
}

export interface XRPLPollRequest extends NetworkSelectionRequest {
  txHash: string;
}

export enum TransactionResponseStatusCode {
  FAILED = -1,
  PENDING = 0,
  CONFIRMED = 1,
}

export interface XRPLPollResponse {
  network: string;
  timestamp: number;
  currentLedgerIndex: number;
  sequence?: number;
  txHash: string;
  txStatus: number;
  txLedgerIndex?: number;
  txData?: TxResponse;
}

export enum XRPLNetworkID {
  MAINNET = 1000,
  TESTNET = 2000,
  DEVNET = 3000,
}

import { NetworkSelectionRequest } from '../../services/common-interfaces';

export interface BalancesRequest extends NetworkSelectionRequest {
  address: string; // the EVM address of a private key
}

export interface PollRequest extends NetworkSelectionRequest {
  txHash: string;
}

export type PollResponse = {
  blockNumber: number;
  hash: string;
  gasWanted: number;
  gasLimit: number;
  gasUsed: number;
  sequences: Array<number>;
};

export type SubaccountBalanceSub = {
  token: string;
  totalBalance: string;
  availableBalance: string;
};

export type SubaccountBalancesWithId = {
  subaccountId: string;
  balances: Array<SubaccountBalanceSub>;
};

export type BankBalance = {
  token: string;
  amount: string;
};

export type BalancesResponse = {
  injectiveAddress: string;
  balances: Array<BankBalance>;
  subaccounts: Array<SubaccountBalancesWithId>;
};

export interface TransferRequest extends NetworkSelectionRequest {
  to: string;
  from: string;
  amount: string;
  token: string;
}

export type TransferResponse = string;

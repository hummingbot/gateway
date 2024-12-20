import {
  CustomTransactionReceipt,
  CustomTransactionResponse,
  NetworkSelectionRequest,
} from '../services/common-interfaces';

import { TokenInfo } from '../chains/ethereum/ethereum-base';
import { TokenInfo as TezosTokenInfo } from '../chains/tezos/tezos.base';

export interface BalanceRequest extends NetworkSelectionRequest {
  address: string; // the users public Ethereum key
  tokenSymbols: string[]; // a list of token symbol
}

export interface BalanceResponse {
  network: string;
  timestamp: number;
  latency: number;
  balances: Record<string, string | null>; // the balance should be a string encoded number
}

export interface PollRequest extends NetworkSelectionRequest {
  txHash?: string; // not required for cosmos when coming after approve() 
}

export interface PollResponse {
  network: string;
  timestamp: number;
  currentBlock: number;
  txHash: string;
  txStatus: number;
  txBlock: number;
  txData: CustomTransactionResponse | null;
  txReceipt?: CustomTransactionReceipt | null;
  tokenId?: number; // filling for cosmos because we don't have a standard txReceipt, so pulling this from controller
}

export interface StatusRequest {
  chain?: string; //the target chain (e.g. ethereum, avalanche, or harmony)
  network?: string; // the target network of the chain (e.g. mainnet)
}

export interface StatusResponse {
  chain: string;
  chainId: number;
  network: string;
  rpcUrl: string;
  nativeCurrency: string;
  currentBlockNumber?: number; // only reachable if connected
}

export interface TokensRequest {
  chain?: string; //the target chain (e.g. ethereum, avalanche, or harmony)
  network?: string; // the target network of the chain (e.g. mainnet)
  tokenSymbols?: string[];
}

export interface TokensResponse {
  tokens: (TokenInfo | TezosTokenInfo)[];
}

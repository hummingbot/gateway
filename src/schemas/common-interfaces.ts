import { Type, Static } from '@sinclair/typebox';
import { Transaction, ethers } from 'ethers';

export interface PriceLevel {
  price: string;
  quantity: string;
  timestamp: number;
}
export interface Orderbook {
  buys: PriceLevel[];
  sells: PriceLevel[];
}

export interface MarketInfo {
  [key: string]: any;
}

export type NetworkSelectionRequest = Static<typeof NetworkSelectionSchema>;

export interface CustomTransactionReceipt
  extends Omit<
    ethers.providers.TransactionReceipt,
    'gasUsed' | 'cumulativeGasUsed' | 'effectiveGasPrice'
  > {
  gasUsed: string;
  cumulativeGasUsed: string;
  effectiveGasPrice: string | null;
}

export interface CustomTransaction
  extends Omit<
    Transaction,
    'maxPriorityFeePerGas' | 'maxFeePerGas' | 'gasLimit' | 'value' | 'chainId'
  > {
  maxPriorityFeePerGas: string | null;
  maxFeePerGas: string | null;
  gasLimit: string | null;
  chainId: number | string;
  value: string;
}

export interface CustomTransactionResponse
  extends Omit<
    ethers.providers.TransactionResponse,
    'gasPrice' | 'gasLimit' | 'value'
  > {
  gasPrice: string | null;
  gasLimit: string;
  value: string;
}

export interface TransferRequest extends NetworkSelectionRequest {
  to: string;
  from: string;
  amount: string;
  token: string;
}

export type TransferResponse = string | FullTransferResponse;

export interface FullTransferResponse {
  network: string;
  timestamp: number;
  latency: number;
  amount: string;
  gasPrice: string;
  gasLimit: string;
  gasUsed: string;
  gasWanted: string;
  txHash: string;
}

export const NetworkSelectionSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
  connector: Type.String(),
});

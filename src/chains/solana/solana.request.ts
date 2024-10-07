export interface SolanaAsset {
  symbol: string;
  assetId: number;
  decimals: number;
}

export interface PollRequest {
  txHash: string;
}

export interface BalancesRequest {
  address: string;
  tokenSymbols: string[];
}

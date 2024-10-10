export interface SolanaAsset {
  symbol: string;
  logoURI: string;
  decimals: number;
  address: string;
  name: string;
}

export interface PollRequest {
  txHash: string;
}

export interface BalancesRequest {
  address: string;
  tokenSymbols: string[];
}

export type AssetsResponse = {
  assets: SolanaAsset[];
};

export type AssetsRequest = {
  network?: string;
  assetSymbols?: string[];
};

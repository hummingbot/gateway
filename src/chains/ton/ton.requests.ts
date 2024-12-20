export interface PollRequest {
  network: string;
  txHash: string;
}


export type PollResponse = {
  currentBlock: number;
  txBlock: number | null;
  txHash: string;
  fee: number;
};

export type AssetsRequest = {
  network?: string;
  assetSymbols?: string[];
};

export interface TonAsset {
  symbol: string;
  assetId: string;
  decimals: number;
}

export type AssetsResponse = {
  assets: TonAsset[];
};

export interface OptInRequest {
  network: string;
  address: string;
  assetSymbol: string;
}

export interface OptInResponse {
  network: string;
  timestamp: number;
  latency: number;
  assetId: number;
  transactionResponse: any;
}

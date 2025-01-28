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
export type StonfiWalletAssetResponse = {
  balance?: string | undefined;
  blacklisted: boolean;
  community: boolean;
  contractAddress: string;
  decimals: number;
  defaultSymbol: boolean;
  deprecated: boolean;
  dexPriceUsd?: string | undefined;
  displayName?: string | undefined;
  imageUrl?: string | undefined;
  kind: 'Ton' | 'Wton' | 'Jetton';
  priority: number;
  symbol: string;
  thirdPartyPriceUsd?: string | undefined;
  walletAddress?: string | undefined;
  // tags: import('./types/asset').AssetTag[];
  customPayloadApiUri?: string | undefined;
  extensions?: string[] | undefined;
};

export type AssetBalanceResponse = {
  [symbol: string]: string;
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

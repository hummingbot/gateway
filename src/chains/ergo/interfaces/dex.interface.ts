export interface DEXToken {
  address: string;
  decimals: number;
  name: string;
  ticker: string;
  logoURI: string;
  project: string;
  description: string;
}

export interface DEXTokensResponse {
  tokens: Array<DEXToken>;
}

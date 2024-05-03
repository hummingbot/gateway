export interface CurveTokenList {
  [network: string]: {
    tags: string[];
    tokens: Token[];
  };
}

export interface Token {
  logos?: Logos;
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  originalName: string;
  originalSymbol: string;
  tags: string[];
  permittable: boolean;
  permit: boolean;
  coins?: string[];
  real?: RealTokenDetails;
  realToken?: RealTokenDetails;
  underlyingCoins?: string[];
  wrapped?: WrappedTokenDetails;
}

interface Logos {
  16: string;
  32: string;
  64: string;
  128: string;
  200: string;
}

interface RealTokenDetails extends Partial<Token> {
  realChainId?: number; // Added if different chain ID is needed than the token itself
}

type WrappedTokenDetails = Partial<Token>;

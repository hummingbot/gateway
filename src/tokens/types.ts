// Common token interface
export interface Token {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
}

// Chain-specific token interfaces
export interface EthereumToken extends Token {
  // Ethereum-specific fields can be added here if needed
  // chainId is derived from network configuration
}

export interface SolanaToken extends Token {
  // Solana-specific fields can be added here if needed
}

// Token list format
export interface TokenList {
  tokens: Token[];
}

// Token file format (what's stored in JSON files)
export type TokenFileFormat = Token[];

// Supported chains
export enum SupportedChain {
  ETHEREUM = 'ethereum',
  SOLANA = 'solana',
}

// Chain validation
export function isSupportedChain(chain: string): chain is SupportedChain {
  return Object.values(SupportedChain).includes(chain as SupportedChain);
}
import { CosmosAsset } from '#src/chains/cosmos/cosmos.universaltypes.js';

// Common token interface
export interface Token {
  chainId?: number;
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  geckoData?: {
    coingeckoCoinId: string | null;
    imageUrl: string;
    priceUsd: string;
    volumeUsd24h: string;
    marketCapUsd: string;
    fdvUsd: string;
    totalSupply: string;
    topPools: string[];
    timestamp: number;
  };
}

// Chain-specific token interfaces
export interface EthereumToken extends Token {
  // Ethereum-specific fields can be added here if needed
  // chainId is derived from network configuration
}

export interface SolanaToken extends Token {
  // Solana-specific fields can be added here if needed
}

export interface CosmosToken extends Token, CosmosAsset {
  // Extended via CosmosAsset
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
  COSMOS = 'cosmos',
}

// Chain validation
export function isSupportedChain(chain: string): chain is SupportedChain {
  return Object.values(SupportedChain).includes(chain as SupportedChain);
}

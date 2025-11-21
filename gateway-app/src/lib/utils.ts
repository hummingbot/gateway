import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { gatewayGet } from './api'
import type { TokenInfo } from './gateway-types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export TokenInfo for convenience
export type { TokenInfo };

export async function getSelectableTokenList(
  chain: string,
  network: string
): Promise<TokenInfo[]> {
  // Fetch all configs to get native currency symbol
  const allConfigsData = await gatewayGet<any>('/config');
  const namespace = `${chain}-${network}`;
  const networkConfig = allConfigsData[namespace];
  const nativeCurrency = networkConfig.nativeCurrencySymbol;

  // Fetch all tokens for this network
  const allTokens = await gatewayGet<{ tokens: TokenInfo[] }>(
    `/tokens?chain=${chain}&network=${network}`
  );

  // Start with native token first
  const tokenList: TokenInfo[] = [
    {
      symbol: nativeCurrency,
      name: nativeCurrency,
      address: '',
      decimals: 18,
    }
  ];

  // Add other tokens (excluding native to avoid duplicates)
  (allTokens.tokens || []).forEach((token) => {
    if (token.symbol !== nativeCurrency) {
      tokenList.push(token);
    }
  });

  return tokenList;
}

/**
 * Get token symbol by address from token list
 * Handles special cases like native tokens and wrapped native tokens
 */
export function getTokenSymbol(
  address: string,
  tokenList: TokenInfo[],
  nativeSymbol?: string
): string {
  // Try exact match first
  const token = tokenList.find(t => t.address === address);
  if (token) {
    return token.symbol;
  }

  // Check if this might be a wrapped native token (e.g., WSOL)
  // Common wrapped native addresses on Solana
  const wrappedNativeAddresses = [
    'So11111111111111111111111111111111111111112', // WSOL
  ];

  if (wrappedNativeAddresses.includes(address)) {
    return nativeSymbol || 'SOL';
  }

  // If no match found, return Unknown
  return 'Unknown';
}

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

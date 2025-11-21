/**
 * useTokenPrice Hook
 *
 * Fetches a single token price on demand with caching.
 * Much simpler than usePriceCache - no complex dependency management.
 */

import { useState, useEffect } from 'react';
import { getCachedPrice, setCachedPrice, type TokenPrice } from '@/lib/price-cache';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { getChainNetwork } from '@/lib/utils/string';

/**
 * Fetch price for a single token
 */
async function fetchTokenPrice(
  chain: string,
  network: string,
  tokenSymbol: string,
  nativeCurrency: string,
  swapProvider: string
): Promise<TokenPrice | null> {
  try {
    // Check cache first
    const cached = getCachedPrice(chain, network, tokenSymbol);
    if (cached) {
      return cached;
    }

    // If token is the native currency, price is always 1 native, need to get USDC rate
    if (tokenSymbol === nativeCurrency) {
      if (nativeCurrency === 'USDC') {
        const price: TokenPrice = {
          nativePrice: 1,
          usdcPrice: 1,
          timestamp: Date.now(),
        };
        setCachedPrice(chain, network, tokenSymbol, price);
        return price;
      }

      // Fetch native→USDC rate
      const chainNetwork = getChainNetwork(chain, network);
      const quote = await gatewayAPI.trading.quoteSwap({
        chainNetwork,
        connector: swapProvider,
        baseToken: nativeCurrency === 'ETH' ? 'WETH' : nativeCurrency,
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
        slippagePct: 1,
      });

      const price: TokenPrice = {
        nativePrice: 1,
        usdcPrice: quote.amountOut,
        timestamp: Date.now(),
      };
      setCachedPrice(chain, network, tokenSymbol, price);
      return price;
    }

    // For other tokens, fetch token→native and native→USDC
    const chainNetwork = getChainNetwork(chain, network);

    // Get token→native price
    const tokenQuote = await gatewayAPI.trading.quoteSwap({
      chainNetwork,
      connector: swapProvider,
      baseToken: tokenSymbol === 'ETH' ? 'WETH' : tokenSymbol,
      quoteToken: nativeCurrency === 'ETH' ? 'WETH' : nativeCurrency,
      amount: 1,
      side: 'SELL',
      slippagePct: 1,
    });

    const nativePrice = tokenQuote.amountOut;

    // Get native→USDC rate (or use 1 if native is USDC)
    let nativeToUsdcRate = 1;
    if (nativeCurrency !== 'USDC') {
      const usdcQuote = await gatewayAPI.trading.quoteSwap({
        chainNetwork,
        connector: swapProvider,
        baseToken: nativeCurrency === 'ETH' ? 'WETH' : nativeCurrency,
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
        slippagePct: 1,
      });
      nativeToUsdcRate = usdcQuote.amountOut;
    }

    const price: TokenPrice = {
      nativePrice,
      usdcPrice: nativePrice * nativeToUsdcRate,
      timestamp: Date.now(),
    };

    setCachedPrice(chain, network, tokenSymbol, price);
    return price;
  } catch (err) {
    console.warn(`Failed to fetch price for ${tokenSymbol}:`, err);
    return null;
  }
}

/**
 * Hook to get price for a single token
 *
 * Returns cached price immediately, fetches if missing.
 */
export function useTokenPrice(
  chain: string,
  network: string,
  tokenSymbol: string,
  nativeCurrency: string,
  swapProvider: string
) {
  const [price, setPrice] = useState<TokenPrice | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Skip if we don't have all required params
    if (!chain || !network || !tokenSymbol || !nativeCurrency || !swapProvider) {
      return;
    }

    // Check cache immediately
    const cached = getCachedPrice(chain, network, tokenSymbol);
    if (cached) {
      setPrice(cached);
      return;
    }

    // Fetch if not cached
    setLoading(true);
    fetchTokenPrice(chain, network, tokenSymbol, nativeCurrency, swapProvider)
      .then((fetchedPrice) => {
        setPrice(fetchedPrice);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [chain, network, tokenSymbol, nativeCurrency, swapProvider]);

  return { price, loading };
}

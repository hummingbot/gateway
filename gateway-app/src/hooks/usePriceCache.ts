/**
 * usePriceCache Hook
 *
 * Fetches and caches token prices with automatic 30-second refresh.
 * Optimized to minimize API calls:
 * - Fetches all token prices in native currency (TOKEN → NATIVE)
 * - Fetches single native→USDC rate
 * - Calculates USDC prices: TOKEN_USDC = TOKEN_NATIVE × NATIVE_USDC
 */

import { useState, useEffect, useRef } from 'react';
import { getCachedPrice, setCachedPrice, type TokenPrice } from '@/lib/price-cache';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { getChainNetwork } from '@/lib/utils/string';

export interface PriceCacheResult {
  /** Map of token symbol → price data */
  prices: Map<string, TokenPrice>;
  /** Whether prices are currently being fetched */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually trigger a price refresh */
  refresh: () => Promise<void>;
}

/**
 * Fetch prices for all tokens using the network's default swap provider
 *
 * @param chain - Chain name
 * @param network - Network name
 * @param nativeCurrency - Native currency symbol (from chain status)
 * @param tokens - Array of token symbols to fetch prices for
 * @param swapProvider - The swap provider connector to use (from chain status)
 * @returns Map of token symbol → price data
 */
async function fetchTokenPrices(
  chain: string,
  network: string,
  nativeCurrency: string,
  tokens: string[],
  swapProvider: string
): Promise<Map<string, TokenPrice>> {
  const pricesMap = new Map<string, TokenPrice>();

  try {
    if (!swapProvider) {
      console.warn(`No swap provider configured for ${chain}-${network}`);
      return pricesMap;
    }

    const chainNetwork = getChainNetwork(chain, network);

    // Helper function to get tradeable token symbol
    // On Ethereum networks, ETH (native) needs to be quoted as WETH
    const getTradableSymbol = (symbol: string) => {
      if (symbol === 'ETH') return 'WETH';
      return symbol;
    };

    // Step 1: Fetch native→USDC rate
    let nativeToUsdcRate = 1;
    if (nativeCurrency !== 'USDC') {
      try {
        const nativeUsdcQuote = await gatewayAPI.trading.quoteSwap({
          chainNetwork,
          connector: swapProvider,
          baseToken: getTradableSymbol(nativeCurrency),
          quoteToken: 'USDC',
          amount: 1,
          side: 'SELL',
          slippagePct: 1,
        });
        nativeToUsdcRate = nativeUsdcQuote.amountOut;
        console.log(`[usePriceCache] ${nativeCurrency}→USDC rate: ${nativeToUsdcRate}`);
      } catch (err) {
        console.warn(`Failed to fetch ${nativeCurrency}→USDC rate:`, err);
      }
    }

    // Step 2: Fetch all token→native prices in parallel
    const quotePromises = tokens
      .filter((token) => {
        // Skip native currency (price = 1)
        if (token === nativeCurrency) return false;
        // Skip if token and native currency are the same after conversion (e.g., WETH and ETH)
        if (getTradableSymbol(token) === getTradableSymbol(nativeCurrency)) return false;
        return true;
      })
      .map(async (token) => {
        try {
          const quote = await gatewayAPI.trading.quoteSwap({
            chainNetwork,
            connector: swapProvider,
            baseToken: getTradableSymbol(token),
            quoteToken: getTradableSymbol(nativeCurrency),
            amount: 1,
            side: 'SELL',
            slippagePct: 1,
          });

          const nativePrice = quote.amountOut;
          const usdcPrice = nativePrice * nativeToUsdcRate;

          console.log(`[usePriceCache] ${token}: nativePrice=${nativePrice}, usdcPrice=${usdcPrice}`);

          const price: TokenPrice = {
            nativePrice,
            usdcPrice,
            timestamp: Date.now(),
          };

          // Cache the price
          setCachedPrice(chain, network, token, price);

          return { token, price };
        } catch (err) {
          console.warn(`Failed to fetch price for ${token}:`, err);
          return null;
        }
      });

    const results = await Promise.all(quotePromises);

    // Build prices map
    results.forEach((result) => {
      if (result) {
        pricesMap.set(result.token, result.price);
      }
    });

    // Add native currency price (always 1 native, calculated USDC)
    const nativePrice: TokenPrice = {
      nativePrice: 1,
      usdcPrice: nativeToUsdcRate,
      timestamp: Date.now(),
    };
    setCachedPrice(chain, network, nativeCurrency, nativePrice);
    pricesMap.set(nativeCurrency, nativePrice);

    // If native currency converts to a different tradable symbol (e.g., ETH → WETH),
    // add that symbol with the same price
    const tradableNative = getTradableSymbol(nativeCurrency);
    if (tradableNative !== nativeCurrency) {
      setCachedPrice(chain, network, tradableNative, nativePrice);
      pricesMap.set(tradableNative, nativePrice);
    }

    // Add USDC price (always 1 USDC, calculated native)
    if (nativeCurrency !== 'USDC') {
      const usdcPrice: TokenPrice = {
        nativePrice: 1 / nativeToUsdcRate,
        usdcPrice: 1,
        timestamp: Date.now(),
      };
      setCachedPrice(chain, network, 'USDC', usdcPrice);
      pricesMap.set('USDC', usdcPrice);
    }
  } catch (err) {
    console.error('Failed to fetch token prices:', err);
  }

  return pricesMap;
}

/**
 * Hook to fetch and cache token prices with auto-refresh
 *
 * @param chain - Chain name
 * @param network - Network name
 * @param nativeCurrency - Native currency symbol (from status.nativeCurrency)
 * @param tokens - Array of token symbols to track
 * @param swapProvider - The swap provider connector to use (from chain status)
 * @returns Price cache result with prices map, loading state, and refresh function
 */
export function usePriceCache(
  chain: string,
  network: string,
  nativeCurrency: string,
  tokens: string[],
  swapProvider: string
): PriceCacheResult {
  const [prices, setPrices] = useState<Map<string, TokenPrice>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch prices function
  const fetchPrices = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first
      const cachedPrices = new Map<string, TokenPrice>();
      let allCached = true;

      tokens.forEach((token) => {
        const cached = getCachedPrice(chain, network, token);
        if (cached) {
          cachedPrices.set(token, cached);
        } else {
          allCached = false;
        }
      });

      // If all prices are cached and fresh, use them
      if (allCached && cachedPrices.size === tokens.length) {
        setPrices(cachedPrices);
        setLoading(false);
        return;
      }

      // Otherwise, fetch fresh prices
      const freshPrices = await fetchTokenPrices(chain, network, nativeCurrency, tokens, swapProvider);
      setPrices(freshPrices);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch prices';
      setError(errorMsg);
      console.error('usePriceCache error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and setup refresh interval
  useEffect(() => {
    console.log('[usePriceCache] Effect triggered:', {
      chain,
      network,
      nativeCurrency,
      tokens,
      swapProvider
    });

    // Clear prices when chain/network changes
    setPrices(new Map());

    // Only fetch if we have all required parameters
    if (!swapProvider || !nativeCurrency || tokens.length === 0) {
      console.log('[usePriceCache] Skipping fetch - missing params');
      setLoading(false);
      return;
    }

    // Validate chain/connector consistency to prevent cross-chain contamination
    const isSolana = chain === 'solana';
    const isJupiter = swapProvider.includes('jupiter');
    const isUniswap = swapProvider.includes('uniswap');

    if ((isSolana && isUniswap) || (!isSolana && isJupiter)) {
      console.log('[usePriceCache] Skipping fetch - invalid chain/connector combo');
      setLoading(false);
      return;
    }

    console.log('[usePriceCache] Starting fetch...');
    // Fetch immediately
    fetchPrices();

    // Setup 30-second refresh interval
    refreshIntervalRef.current = setInterval(fetchPrices, 30000);

    // Cleanup on unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [chain, network, nativeCurrency, tokens.join(','), swapProvider]);

  return {
    prices,
    loading,
    error,
    refresh: fetchPrices,
  };
}

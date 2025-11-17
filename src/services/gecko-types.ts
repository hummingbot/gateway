/**
 * Centralized GeckoTerminal data type definitions and transformation helpers
 * Ensures consistent data structure across all gecko-related operations
 */

import { PoolGeckoData } from '../pools/schemas';
import { TokenGeckoData } from '../tokens/schemas';

/**
 * Raw pool data from GeckoTerminal API (TopPoolInfo)
 * This is what we receive from the API
 */
export interface GeckoRawPoolData {
  volumeUsd24h: string;
  liquidityUsd: string;
  priceNative: string;
  priceUsd: string;
  txns24h: {
    buys: number;
    sells: number;
  };
}

/**
 * Raw token market data from GeckoTerminal API
 * This is what we receive from the API
 */
export interface GeckoRawTokenData {
  coingeckoCoinId: string | null;
  imageUrl: string;
  priceUsd: string;
  volumeUsd24h: string;
  marketCapUsd: string;
  fdvUsd: string;
  totalSupply: string;
  topPools: string[];
}

/**
 * Transform raw pool data from GeckoTerminal API to standardized PoolGeckoData format
 * @param rawData - Raw pool data from GeckoTerminal API
 * @param apr - Optional APR value (calculated separately)
 * @returns Standardized PoolGeckoData with timestamp
 */
export function toPoolGeckoData(rawData: GeckoRawPoolData, apr?: number): PoolGeckoData {
  return {
    volumeUsd24h: rawData.volumeUsd24h,
    liquidityUsd: rawData.liquidityUsd,
    priceNative: rawData.priceNative,
    priceUsd: rawData.priceUsd,
    buys24h: rawData.txns24h?.buys || 0,
    sells24h: rawData.txns24h?.sells || 0,
    ...(apr !== undefined && { apr }),
    timestamp: Date.now(),
  };
}

/**
 * Transform raw token data from GeckoTerminal API to standardized TokenGeckoData format
 * @param rawData - Raw token data from GeckoTerminal API
 * @returns Standardized TokenGeckoData with timestamp
 */
export function toTokenGeckoData(rawData: GeckoRawTokenData): TokenGeckoData {
  return {
    coingeckoCoinId: rawData.coingeckoCoinId,
    imageUrl: rawData.imageUrl,
    priceUsd: rawData.priceUsd,
    volumeUsd24h: rawData.volumeUsd24h,
    marketCapUsd: rawData.marketCapUsd,
    fdvUsd: rawData.fdvUsd,
    totalSupply: rawData.totalSupply,
    topPools: rawData.topPools,
    timestamp: Date.now(),
  };
}

/**
 * Extract gecko pool data from TopPoolInfo
 * @param topPoolInfo - Pool info from GeckoTerminal
 * @returns Raw pool data ready for transformation
 */
export function extractRawPoolData(topPoolInfo: {
  volumeUsd24h: string;
  liquidityUsd: string;
  priceNative: string;
  priceUsd: string;
  txns24h: { buys: number; sells: number };
}): GeckoRawPoolData {
  return {
    volumeUsd24h: topPoolInfo.volumeUsd24h,
    liquidityUsd: topPoolInfo.liquidityUsd,
    priceNative: topPoolInfo.priceNative,
    priceUsd: topPoolInfo.priceUsd,
    txns24h: topPoolInfo.txns24h,
  };
}

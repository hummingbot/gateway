import { logger } from '../../services/logger';

import { SolanaNetworkConfig } from './solana.config';

/**
 * Helius priority fee levels for transaction processing
 * Must match Helius API casing: Min, Low, Medium, High, VeryHigh, UnsafeMax
 * @see https://docs.helius.dev/solana-apis/priority-fee-api
 */
export type PriorityFeeLevel = 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax';

/**
 * Detailed result from priority fee estimation
 */
export interface PriorityFeeResult {
  /** Final fee per compute unit in lamports (after min/max clamping) */
  feePerComputeUnit: number;
  /** Priority level used for the estimate */
  priorityFeeLevel: PriorityFeeLevel;
  /** Raw Helius estimate in lamports/CU (before clamping), null if Helius not used */
  priorityFeePerCUEstimate: number | null;
}

/**
 * Cached priority fee result
 */
interface CachedFeeResult {
  result: PriorityFeeResult;
  timestamp: number;
}

/**
 * Extract Helius API key from various sources
 * @param nodeURL The node URL from config
 * @returns API key if found, null otherwise
 */
export async function getHeliusApiKey(nodeURL?: string): Promise<string | null> {
  // First try apiKeys.helius from config
  const { ConfigManagerV2 } = await import('../../services/config-manager-v2');
  const configManager = ConfigManagerV2.getInstance();
  const configApiKey = configManager.get('apiKeys.helius') || '';

  if (configApiKey && configApiKey.trim() !== '' && !configApiKey.includes('YOUR_')) {
    return configApiKey;
  }

  // If not found, try to extract from nodeURL if it's a Helius URL
  if (nodeURL && nodeURL.includes('helius')) {
    try {
      const url = new URL(nodeURL);
      // Check for api-key query parameter (e.g., https://mainnet.helius-rpc.com/?api-key=xxx)
      const apiKeyParam = url.searchParams.get('api-key');
      if (apiKeyParam && apiKeyParam.trim() !== '' && !apiKeyParam.includes('YOUR_')) {
        return apiKeyParam;
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  return null;
}

/**
 * Priority fee estimation using Helius getPriorityFeeEstimate RPC method
 * Results are cached for 10 seconds per network
 */
export class SolanaPriorityFees {
  // Cache TTL in milliseconds (10 seconds)
  private static readonly CACHE_TTL_MS = 10_000;

  // Cache keyed by network name
  private static cache: Map<string, CachedFeeResult> = new Map();

  // Default accounts used when no specific accounts are provided
  private static readonly DEFAULT_ACCOUNT_KEYS = [
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
  ];

  /**
   * Get cached result if valid
   */
  private static getCached(network: string): PriorityFeeResult | null {
    const cached = SolanaPriorityFees.cache.get(network);
    if (cached && Date.now() - cached.timestamp < SolanaPriorityFees.CACHE_TTL_MS) {
      logger.debug(`[${network}] Using cached priority fee estimate`);
      return cached.result;
    }
    return null;
  }

  /**
   * Store result in cache
   */
  private static setCache(network: string, result: PriorityFeeResult): void {
    SolanaPriorityFees.cache.set(network, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Estimates priority fees using Helius or returns config default
   * Results are cached for 10 seconds
   * @param config Network configuration
   * @param network Network name for caching
   * @returns Final fee per compute unit in lamports
   */
  public static async estimatePriorityFee(config: SolanaNetworkConfig, network: string): Promise<number> {
    const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(config, network);
    return result.feePerComputeUnit;
  }

  /**
   * Estimates priority fees with detailed results
   * Results are cached for 10 seconds
   * @param config Network configuration
   * @param network Network name for caching
   * @returns Detailed fee estimation result
   */
  public static async estimatePriorityFeeDetailed(
    config: SolanaNetworkConfig,
    network: string,
  ): Promise<PriorityFeeResult> {
    // Check cache first
    const cached = SolanaPriorityFees.getCached(network);
    if (cached) {
      return cached;
    }

    const level: PriorityFeeLevel = (config.priorityFeeLevel as PriorityFeeLevel) || 'High';
    const minimumFee = config.minPriorityFeePerCU || 0.1;
    const maximumFee = config.maxPriorityFeePerCU || 1.0;

    try {
      // Get Helius API key from config or nodeURL
      const apiKey = await getHeliusApiKey(config.nodeURL);

      if (!apiKey) {
        logger.info(`[${level}] No Helius API key found, using minimum fee: ${minimumFee.toFixed(4)} lamports/CU`);
        const result: PriorityFeeResult = {
          feePerComputeUnit: minimumFee,
          priorityFeeLevel: level,
          priorityFeePerCUEstimate: null,
        };
        SolanaPriorityFees.setCache(network, result);
        return result;
      }

      // Construct the request URL
      const requestUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

      logger.debug(`[${level}] Fetching priority fee estimate from Helius`);

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'getPriorityFeeEstimate',
          params: [
            {
              accountKeys: SolanaPriorityFees.DEFAULT_ACCOUNT_KEYS,
              options: { priorityLevel: level },
            },
          ],
          id: 1,
          jsonrpc: '2.0',
        }),
      });

      if (!response.ok) {
        logger.error(`[${level}] Failed to fetch priority fee estimate: ${response.status}`);
        const result: PriorityFeeResult = {
          feePerComputeUnit: minimumFee,
          priorityFeeLevel: level,
          priorityFeePerCUEstimate: null,
        };
        SolanaPriorityFees.setCache(network, result);
        return result;
      }

      const data = await response.json();

      if (data.error) {
        logger.error(`[${level}] Priority fee estimate RPC error: ${JSON.stringify(data.error)}`);
        const result: PriorityFeeResult = {
          feePerComputeUnit: minimumFee,
          priorityFeeLevel: level,
          priorityFeePerCUEstimate: null,
        };
        SolanaPriorityFees.setCache(network, result);
        return result;
      }

      const priorityFeeEstimate = data.result?.priorityFeeEstimate;

      if (typeof priorityFeeEstimate !== 'number') {
        logger.warn(`[${level}] Invalid priority fee estimate response, using minimum fee`);
        const result: PriorityFeeResult = {
          feePerComputeUnit: minimumFee,
          priorityFeeLevel: level,
          priorityFeePerCUEstimate: null,
        };
        SolanaPriorityFees.setCache(network, result);
        return result;
      }

      // Convert from micro-lamports to lamports per compute unit
      const priorityFeeLamports = priorityFeeEstimate / 1_000_000;

      // Clamp fee between minimum and maximum
      const finalFee = Math.min(Math.max(priorityFeeLamports, minimumFee), maximumFee);

      const clampInfo =
        priorityFeeLamports < minimumFee ? 'min enforced' : priorityFeeLamports > maximumFee ? 'max enforced' : 'ok';

      logger.info(
        `[${level}] Priority fee: ${priorityFeeLamports.toFixed(6)} -> ${finalFee.toFixed(6)} lamports/CU (${clampInfo})`,
      );

      const result: PriorityFeeResult = {
        feePerComputeUnit: finalFee,
        priorityFeeLevel: level,
        priorityFeePerCUEstimate: priorityFeeLamports,
      };
      SolanaPriorityFees.setCache(network, result);
      return result;
    } catch (error: any) {
      logger.error(`[${level}] Failed to fetch priority fee estimate: ${error.message}, using minimum fee`);
      const result: PriorityFeeResult = {
        feePerComputeUnit: minimumFee,
        priorityFeeLevel: level,
        priorityFeePerCUEstimate: null,
      };
      SolanaPriorityFees.setCache(network, result);
      return result;
    }
  }

  /**
   * Clear the cache (useful for testing)
   */
  public static clearCache(): void {
    SolanaPriorityFees.cache.clear();
  }
}

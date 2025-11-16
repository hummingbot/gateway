import { logger } from '../../services/logger';

import { SolanaNetworkConfig } from './solana.config';

/**
 * Priority fee estimation using Helius getPriorityFeeEstimate RPC method
 */
export class SolanaPriorityFees {
  private static lastPriorityFeeEstimate: {
    [network: string]: {
      timestamp: number;
      fee: number;
    };
  } = {};
  private static readonly PRIORITY_FEE_CACHE_MS = 10000; // 10 second cache

  /**
   * Estimates priority fees using Helius getPriorityFeeEstimate RPC method
   */
  public static async estimatePriorityFee(config: SolanaNetworkConfig, network: string): Promise<number> {
    // Check cache first (per-network)
    const cachedEstimate = SolanaPriorityFees.lastPriorityFeeEstimate[network];
    if (cachedEstimate && Date.now() - cachedEstimate.timestamp < SolanaPriorityFees.PRIORITY_FEE_CACHE_MS) {
      logger.debug(`Using cached priority fee for ${network}: ${cachedEstimate.fee.toFixed(4)} lamports/CU`);
      return cachedEstimate.fee;
    }

    try {
      // Try to get Helius API key from RPC config
      const { ConfigManagerV2 } = await import('../../services/config-manager-v2');
      const configManager = ConfigManagerV2.getInstance();
      const apiKey = configManager.get('helius.apiKey') || '';

      if (!apiKey || apiKey.trim() === '' || apiKey.includes('YOUR_')) {
        const minimumFee = config.minPriorityFeePerCU || 0.1;
        logger.info(`No valid Helius API key, using minimum fee: ${minimumFee.toFixed(4)} lamports/CU`);
        return minimumFee;
      }

      // Construct the request URL
      const requestUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'getPriorityFeeEstimate',
          params: [
            {
              accountKeys: ['11111111111111111111111111111112'], // System Program
              options: { recommended: true },
            },
          ],
          id: 1,
          jsonrpc: '2.0',
        }),
      });

      if (!response.ok) {
        logger.error(`Failed to fetch priority fee estimate: ${response.status}`);
        return config.minPriorityFeePerCU || 0.1;
      }

      const data = await response.json();

      if (data.error) {
        logger.error(`Priority fee estimate RPC error: ${JSON.stringify(data.error)}`);
        return config.minPriorityFeePerCU || 0.1;
      }

      const priorityFeeEstimate = data.result?.priorityFeeEstimate;

      if (typeof priorityFeeEstimate !== 'number') {
        logger.warn('Invalid priority fee estimate response, using minimum fee');
        return config.minPriorityFeePerCU || 0.1;
      }

      // Convert from micro-lamports to lamports per compute unit
      const priorityFeeLamports = priorityFeeEstimate / 1_000_000;

      // Ensure fee is not below minimum
      const minimumFee = config.minPriorityFeePerCU || 0.1;
      const finalFee = Math.max(priorityFeeLamports, minimumFee);

      logger.info(
        `Priority fee estimate: ${priorityFeeLamports.toFixed(4)} lamports/CU -> using ${finalFee.toFixed(4)} lamports/CU (${finalFee === minimumFee ? 'minimum enforced' : 'recommended'})`,
      );

      // Cache the result (per-network)
      SolanaPriorityFees.lastPriorityFeeEstimate[network] = {
        timestamp: Date.now(),
        fee: finalFee,
      };

      return finalFee;
    } catch (error: any) {
      logger.error(`Failed to fetch priority fee estimate: ${error.message}, using minimum fee`);
      return config.minPriorityFeePerCU || 0.1;
    }
  }
}

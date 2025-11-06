import { logger } from './logger';

/**
 * Service for managing position tracking across different chains and connectors
 * This is a chain-agnostic service that can be used by any chain connector
 */
export class PositionsService {
  private static instance: PositionsService;

  private constructor() {}

  public static getInstance(): PositionsService {
    if (!PositionsService.instance) {
      PositionsService.instance = new PositionsService();
    }
    return PositionsService.instance;
  }

  /**
   * Track positions for wallets - used for both initial loading and periodic refresh
   * Caches each position individually by position address
   *
   * @param wallets Array of wallet addresses to track
   * @param positionCache Cache manager to store position data
   * @param getPositions Callback to fetch positions for a wallet
   * @returns Object with successCount and failedCount
   */
  public async trackPositions(
    wallets: string[],
    positionCache: any, // CacheManager<PositionData>
    getPositions: (walletAddress: string) => Promise<any[]>,
  ): Promise<{ successCount: number; failedCount: number }> {
    let successCount = 0;
    let failedCount = 0;

    logger.info(`Tracking positions for ${wallets.length} wallet(s)...`);

    for (const walletAddress of wallets) {
      try {
        const positions = await getPositions(walletAddress);
        if (positions && positions.length > 0) {
          // Cache each position individually by position address
          for (const position of positions) {
            if (position.address) {
              positionCache.set(position.address, {
                positions: [position],
              });
            }
          }
          successCount++;
          logger.debug(`[position-cache] Loaded ${positions.length} position(s) for ${walletAddress}`);
        }
      } catch (error: any) {
        logger.warn(`Failed to fetch positions for ${walletAddress}: ${error.message}`);
        failedCount++;
      }
    }

    logger.info(
      `📍 Loaded positions for ${successCount} wallet(s)${failedCount > 0 ? ` (${failedCount} failed)` : ''}`,
    );
    return { successCount, failedCount };
  }
}

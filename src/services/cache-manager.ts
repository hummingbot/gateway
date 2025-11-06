/**
 * Generic cache manager for storing and managing cached data
 * Provider-agnostic, works with any RPC provider (Helius, Infura, etc.)
 */

import { logger } from './logger';

export interface CacheConfig {
  enabled: boolean;
  refreshInterval: number; // seconds - how often to refresh all cached entries
  maxAge: number; // seconds - when to consider data stale
  ttl: number; // seconds - when to remove unused entries
}

export interface CachedData<T> {
  data: T;
  lastUpdate: number; // Unix timestamp (ms)
  lastAccessed: number; // Unix timestamp (ms)
  slot?: number; // Optional blockchain slot number
}

/**
 * Generic cache manager that can be used for balances, positions, pools, etc.
 * Provides TTL, staleness detection, and periodic refresh capabilities.
 */
export class CacheManager<T> {
  private cache: Map<string, CachedData<T>> = new Map();
  private config: CacheConfig;
  private refreshTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private name: string;

  constructor(config: CacheConfig, name: string) {
    this.config = config;
    this.name = name;

    if (config.enabled) {
      this.startCleanupTimer();
      logger.info(
        `${this.name} cache initialized: refresh=${config.refreshInterval}s, maxAge=${config.maxAge}s, ttl=${config.ttl}s`,
      );
    } else {
      logger.info(`${this.name} cache disabled`);
    }
  }

  /**
   * Get cached data for a key
   * Updates lastAccessed timestamp
   * @param key Cache key
   * @returns Cached data or null if not found/disabled
   */
  public get(key: string): T | null {
    if (!this.config.enabled) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // Update last accessed time for TTL tracking
    cached.lastAccessed = Date.now();

    const age = Date.now() - cached.lastUpdate;
    logger.debug(
      `[${this.name}-cache] HIT for ${key} (age: ${Math.round(age / 1000)}s, slot: ${cached.slot || 'unknown'})`,
    );

    return cached.data;
  }

  /**
   * Set cached data for a key
   * @param key Cache key
   * @param data Data to cache
   * @param slot Optional blockchain slot number
   */
  public set(key: string, data: T, slot?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      lastUpdate: now,
      lastAccessed: now,
      slot,
    });

    logger.debug(`[${this.name}-cache] SET for ${key}${slot ? ` at slot ${slot}` : ''}`);
  }

  /**
   * Check if cached data is stale (older than maxAge)
   * @param key Cache key
   * @returns true if stale or not found
   */
  public isStale(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) {
      return true;
    }

    const age = Date.now() - cached.lastUpdate;
    const stale = age > this.config.maxAge * 1000;

    if (stale) {
      logger.debug(
        `[${this.name}-cache] STALE for ${key} (age: ${Math.round(age / 1000)}s > maxAge: ${this.config.maxAge}s)`,
      );
    }

    return stale;
  }

  /**
   * Get all cached keys
   * @returns Array of cache keys
   */
  public keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get number of cached entries
   * @returns Cache size
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Clear specific cache entry
   * @param key Cache key to clear
   */
  public clear(key: string): void {
    this.cache.delete(key);
    logger.debug(`[${this.name}-cache] CLEAR ${key}`);
  }

  /**
   * Clear all cache entries
   */
  public clearAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`[${this.name}-cache] CLEAR ALL (${size} entries removed)`);
  }

  /**
   * Start periodic cleanup timer to remove expired entries based on TTL
   * Runs every 5 minutes
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const ttlMs = this.config.ttl * 1000;

      let removed = 0;
      for (const [key, cached] of this.cache.entries()) {
        const timeSinceAccess = now - cached.lastAccessed;
        if (timeSinceAccess > ttlMs) {
          this.cache.delete(key);
          removed++;
        }
      }

      if (removed > 0) {
        logger.info(`[${this.name}-cache] TTL cleanup removed ${removed} entries (size now: ${this.cache.size})`);
      }
    }, 300000); // 5 minutes
  }

  /**
   * Start periodic refresh timer
   * Calls the provided refresh function at the configured interval
   * @param refreshFn Function that refreshes cached data for given keys
   */
  public startPeriodicRefresh(refreshFn: (keys: string[]) => Promise<void>): void {
    if (!this.config.enabled || this.config.refreshInterval <= 0) {
      return;
    }

    logger.info(`[${this.name}-cache] Starting periodic refresh every ${this.config.refreshInterval}s`);

    this.refreshTimer = setInterval(async () => {
      const keys = this.keys();
      if (keys.length === 0) {
        return;
      }

      logger.debug(`[${this.name}-cache] Starting periodic refresh for ${keys.length} entries`);

      try {
        await refreshFn(keys);
        logger.debug(`[${this.name}-cache] Periodic refresh completed for ${keys.length} entries`);
      } catch (error: any) {
        logger.warn(`[${this.name}-cache] Periodic refresh failed: ${error.message}`);
      }
    }, this.config.refreshInterval * 1000);
  }

  /**
   * Stop all timers and clear cache
   */
  public destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
    logger.info(`[${this.name}-cache] Destroyed`);
  }

  /**
   * Get cache statistics
   * @returns Cache stats object
   */
  public getStats(): {
    name: string;
    size: number;
    enabled: boolean;
    config: CacheConfig;
  } {
    return {
      name: this.name,
      size: this.cache.size,
      enabled: this.config.enabled,
      config: this.config,
    };
  }
}

/**
 * Rate limiter for controlling concurrent API/RPC requests
 * Uses a token bucket algorithm with configurable concurrency and delay
 */

import { logger } from './logger';

export interface RateLimiterConfig {
  maxConcurrent: number; // Maximum concurrent requests
  minDelay: number; // Minimum delay between requests in milliseconds
  name?: string; // Optional name for logging
}

export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeCount = 0;
  private lastRequestTime = 0;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = {
      name: 'rate-limiter',
      ...config,
    };
  }

  /**
   * Execute a function with rate limiting
   * @param fn Function to execute
   * @returns Promise that resolves with the function result
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      const result = await fn();
      return result;
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Wait for a slot to become available
   */
  private async acquireSlot(): Promise<void> {
    // Wait for concurrent limit
    if (this.activeCount >= this.config.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    // Wait for minimum delay
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.minDelay) {
      const delay = this.config.minDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.activeCount++;
    this.lastRequestTime = Date.now();
  }

  /**
   * Release a slot and process next queued request
   */
  private releaseSlot(): void {
    this.activeCount--;

    // Process next queued request
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Get current state for debugging
   */
  getState(): { active: number; queued: number } {
    return {
      active: this.activeCount,
      queued: this.queue.length,
    };
  }

  /**
   * Reset the rate limiter state
   */
  reset(): void {
    this.queue = [];
    this.activeCount = 0;
    this.lastRequestTime = 0;
  }
}

/**
 * Batch execute an array of functions with rate limiting
 * @param items Array of items to process
 * @param fn Function to execute for each item
 * @param config Rate limiter configuration
 * @returns Promise that resolves with array of results
 */
export async function batchExecute<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  config: RateLimiterConfig,
): Promise<R[]> {
  const limiter = new RateLimiter(config);
  const results: R[] = [];

  logger.debug(
    `[${config.name || 'batch'}] Processing ${items.length} items (max concurrent: ${config.maxConcurrent}, min delay: ${config.minDelay}ms)`,
  );

  for (const item of items) {
    const result = await limiter.execute(() => fn(item));
    results.push(result);
  }

  logger.debug(`[${config.name || 'batch'}] Completed processing ${items.length} items`);

  return results;
}

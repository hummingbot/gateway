/**
 * API Helper Utilities
 *
 * Wrapper functions for common API operation patterns with error handling and notifications.
 */

import { gatewayAPI } from '../GatewayAPI';
import { showSuccessNotification, showErrorNotification } from '../notifications';

/**
 * Options for withLoadingAndNotification wrapper
 */
export interface LoadingNotificationOptions {
  /** Success message to display (if undefined, no success notification) */
  successMessage?: string;
  /** Prefix for error messages (default: 'Operation failed') */
  errorPrefix?: string;
  /** Custom error handler callback */
  onError?: (error: Error) => void;
}

/**
 * Wrapper for async operations with loading state and notifications
 * Reduces boilerplate error handling across components
 *
 * @param operation - Async function to execute
 * @param setLoading - Loading state setter
 * @param options - Configuration options
 * @returns Result of operation or null if error occurred
 *
 * @example
 * const result = await withLoadingAndNotification(
 *   () => gatewayPost('/endpoint', data),
 *   setLoading,
 *   { successMessage: 'Operation completed!' }
 * );
 */
export async function withLoadingAndNotification<T>(
  operation: () => Promise<T>,
  setLoading: (loading: boolean) => void,
  options?: LoadingNotificationOptions
): Promise<T | null> {
  const { successMessage, errorPrefix = 'Operation failed', onError } = options || {};

  try {
    setLoading(true);
    const result = await operation();

    if (successMessage) {
      await showSuccessNotification(successMessage);
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error');
    const message = `${errorPrefix}: ${error.message}`;

    await showErrorNotification(message);

    if (onError) {
      onError(error);
    }

    return null;
  } finally {
    setLoading(false);
  }
}

/**
 * Retry wrapper for API calls with exponential backoff
 * Useful for transient failures
 *
 * @param operation - Async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param delayMs - Initial delay in milliseconds (default: 1000)
 * @returns Result of successful operation
 * @throws Last error if all retries fail
 *
 * @example
 * const data = await withRetry(
 *   () => gatewayGet('/endpoint'),
 *   3,  // retry up to 3 times
 *   1000  // start with 1s delay
 * );
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');

      // Don't delay after the last attempt
      if (i < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s, ...
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }

  throw lastError!;
}

/**
 * Fetch available router connectors for a given chain and network
 * Filters connectors to only include those that support 'router' type
 *
 * @param chain - Chain name (e.g., 'solana', 'ethereum')
 * @param network - Network name (e.g., 'mainnet-beta', 'mainnet')
 * @returns Array of connector names that support router swaps
 *
 * @example
 * const routers = await getRouterConnectors('solana', 'mainnet-beta');
 * // Returns: ['jupiter', '0x', 'uniswap']
 */
export async function getRouterConnectors(chain: string, network: string): Promise<string[]> {
  try {
    const data = await gatewayAPI.config.getConnectors();

    // Filter connectors that support the router type for this chain and network
    const routerConnectors = data.connectors
      .filter((conn) => {
        // Check if connector is for this chain
        if (conn.chain !== chain) return false;

        // Check if this network is available
        if (!conn.networks.includes(network)) return false;

        // Check if router type is supported
        return conn.trading_types.includes('router');
      })
      .map((conn) => conn.name);

    return routerConnectors;
  } catch (error) {
    console.error('Failed to fetch router connectors:', error);
    return [];
  }
}

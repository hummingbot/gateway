/**
 * API Helper Utilities
 *
 * Wrapper functions for common API operation patterns with error handling and notifications.
 */

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

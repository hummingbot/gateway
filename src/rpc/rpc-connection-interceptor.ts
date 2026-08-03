/**
 * Generic RPC connection interceptor for rate limit detection
 * Works with both Solana (@solana/web3.js Connection) and Ethereum (ethers Provider)
 */

import { Connection } from '@solana/web3.js';
import { providers } from 'ethers';

import { logger } from '../services/logger';

// Read RPC retry policy, applied to both chains. This Proxy is the single
// retry layer: ethers and web3.js built-in 429 retries are disabled, so use
// bounded exponential backoff with jitter. Writes are never retried.
const READ_RETRY_ATTEMPTS = 3;
const READ_RETRY_BASE_DELAY_MS = 500;
const READ_RETRY_MAX_DELAY_MS = 5000;
const READ_RETRY_JITTER = 0.2;

/**
 * Redact sensitive parts of RPC URL (API keys, tokens)
 */
function redactUrl(url: string): string {
  if (!url) return url;
  return url.replace(/([?&]api[-_]key=)[^&]+/gi, '$1[REDACTED]').replace(/(\/\/[^/]+@)/g, '//[REDACTED]@');
}

/**
 * Detect if an error is a 429 rate limit error
 */
function is429Error(error: any): boolean {
  if (!error) return false;

  const errorStr = JSON.stringify(error);

  // Check various ways 429 might appear in RPC errors
  return (
    error?.message?.includes('429') ||
    error?.message?.toLowerCase().includes('too many requests') ||
    error?.message?.toLowerCase().includes('rate limit') ||
    error?.code === 429 ||
    error?.status === 429 ||
    error?.response?.status === 429 ||
    errorStr.includes('"code": 429') ||
    errorStr.includes('"code":429') ||
    errorStr.includes('"status": 429') ||
    errorStr.includes('"status":429')
  );
}

function isRetryableReadMethod(prop: string | symbol): boolean {
  return typeof prop === 'string' && (prop.startsWith('get') || prop === 'call');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getReadRetryDelayMs(attempt: number): number {
  const delay = Math.min(READ_RETRY_BASE_DELAY_MS * 2 ** attempt, READ_RETRY_MAX_DELAY_MS);
  const jitter = delay * READ_RETRY_JITTER * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Create error message based on chain type
 */
function createRateLimitErrorMessage(rpcUrl: string, chainType: 'solana' | 'ethereum'): string {
  const redactedUrl = redactUrl(rpcUrl);

  if (chainType === 'solana') {
    return (
      `Solana RPC rate limit exceeded. Your current RPC endpoint (${redactedUrl}) has reached its rate limit. ` +
      `To fix: Add an RPC provider API key to conf/apiKeys.yml and set 'rpcProvider' in conf/chains/solana.yml`
    );
  } else {
    // Ethereum
    return (
      `Ethereum RPC rate limit exceeded. Your current RPC endpoint (${redactedUrl}) has reached its rate limit. ` +
      `To fix: Add an RPC provider API key to conf/apiKeys.yml and set 'rpcProvider' in conf/chains/ethereum.yml`
    );
  }
}

function createRateLimitError(rpcUrl: string, chainType: 'solana' | 'ethereum'): Error {
  const rateLimitError: any = new Error(createRateLimitErrorMessage(rpcUrl, chainType));
  rateLimitError.statusCode = 429;
  rateLimitError.name = 'TooManyRequestsError';
  return rateLimitError;
}

/**
 * Create a rate-limit aware Solana Connection using Proxy pattern
 *
 * @param connection - The Solana Connection instance to wrap
 * @param rpcUrl - The RPC URL for error messages
 * @returns Proxied Connection that throws errors with statusCode 429 on rate limits
 */
export function createRateLimitAwareSolanaConnection(connection: Connection, rpcUrl: string): Connection {
  return new Proxy(connection, {
    get(target: Connection, prop: string | symbol): any {
      const value = target[prop as keyof Connection];

      // Only intercept methods
      if (typeof value !== 'function') {
        return value;
      }

      // Return wrapped async function that catches 429 errors
      return async function (this: Connection, ...args: any[]) {
        const maxAttempts = isRetryableReadMethod(prop) ? READ_RETRY_ATTEMPTS + 1 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return await (value as (...args: any[]) => any).apply(target, args);
          } catch (error: any) {
            if (!is429Error(error)) {
              throw error;
            }

            const redactedUrl = redactUrl(rpcUrl);
            if (attempt < maxAttempts - 1) {
              const delayMs = getReadRetryDelayMs(attempt);
              logger.warn(
                `Solana RPC rate limit exceeded: ${redactedUrl}, method: ${String(prop)}. ` +
                  `Retrying in ${delayMs}ms (${attempt + 1}/${READ_RETRY_ATTEMPTS})`,
              );
              await sleep(delayMs);
              continue;
            }

            logger.error(`⚠️  Solana RPC rate limit exceeded: ${redactedUrl}, method: ${String(prop)}`);
            logger.error(`Original error: ${error.message}`);
            throw createRateLimitError(rpcUrl, 'solana');
          }
        }
      };
    },
  });
}

/**
 * Create a rate-limit aware Ethereum Provider using Proxy pattern
 *
 * @param provider - The ethers Provider instance to wrap
 * @param rpcUrl - The RPC URL for error messages
 * @returns Proxied Provider that throws errors with statusCode 429 on rate limits
 */
export function createRateLimitAwareEthereumProvider<T extends providers.BaseProvider>(provider: T, rpcUrl: string): T {
  return new Proxy(provider, {
    get(target: T, prop: string | symbol): any {
      const value = target[prop as keyof T];

      // Only intercept methods
      if (typeof value !== 'function') {
        return value;
      }

      // Return wrapped async function that retries read 429s, then normalizes.
      // This is the single retry layer for Ethereum reads: the underlying provider
      // is constructed with throttleLimit: 1 so ethers does NOT retry 429s itself,
      // avoiding a compounding retry. This also covers rate limits returned as a
      // JSON-RPC error body (HTTP 200), which ethers' own throttle would ignore.
      return async function (this: T, ...args: any[]) {
        const maxAttempts = isRetryableReadMethod(prop) ? READ_RETRY_ATTEMPTS + 1 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return await (value as (...args: any[]) => any).apply(target, args);
          } catch (error: any) {
            if (!is429Error(error)) {
              throw error;
            }

            const redactedUrl = redactUrl(rpcUrl);
            if (attempt < maxAttempts - 1) {
              const delayMs = getReadRetryDelayMs(attempt);
              logger.warn(
                `Ethereum RPC rate limit exceeded: ${redactedUrl}, method: ${String(prop)}. ` +
                  `Retrying in ${delayMs}ms (${attempt + 1}/${READ_RETRY_ATTEMPTS})`,
              );
              await sleep(delayMs);
              continue;
            }

            logger.error(`⚠️  Ethereum RPC rate limit exceeded: ${redactedUrl}, method: ${String(prop)}`);
            logger.error(`Original error: ${error.message}`);
            throw createRateLimitError(rpcUrl, 'ethereum');
          }
        }
      };
    },
  }) as T;
}

// Legacy export for backward compatibility
export { createRateLimitAwareSolanaConnection as createRateLimitAwareConnection };

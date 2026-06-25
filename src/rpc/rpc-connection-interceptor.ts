/**
 * Generic RPC connection interceptor for rate limit detection
 * Works with both Solana (@solana/web3.js Connection) and Ethereum (ethers Provider)
 */

import { Connection } from '@solana/web3.js';
import { providers } from 'ethers';

import { logger } from '../services/logger';

const SOLANA_READ_RETRY_DELAYS_MS = [5000, 5000, 5000];

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

function isRetryableSolanaReadMethod(prop: string | symbol): boolean {
  return typeof prop === 'string' && prop.startsWith('get');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        const maxAttempts = isRetryableSolanaReadMethod(prop) ? SOLANA_READ_RETRY_DELAYS_MS.length + 1 : 1;

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
              const delayMs = SOLANA_READ_RETRY_DELAYS_MS[attempt];
              logger.warn(
                `Solana RPC rate limit exceeded: ${redactedUrl}, method: ${String(prop)}. ` +
                  `Retrying in ${delayMs}ms (${attempt + 1}/${SOLANA_READ_RETRY_DELAYS_MS.length})`,
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

      // Return wrapped async function that catches 429 errors
      return async function (this: T, ...args: any[]) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return await (value as (...args: any[]) => any).apply(target, args);
        } catch (error: any) {
          if (is429Error(error)) {
            const redactedUrl = redactUrl(rpcUrl);
            logger.error(`⚠️  Ethereum RPC rate limit exceeded: ${redactedUrl}, method: ${String(prop)}`);
            logger.error(`Original error: ${error.message}`);
            throw createRateLimitError(rpcUrl, 'ethereum');
          }
          throw error;
        }
      };
    },
  }) as T;
}

// Legacy export for backward compatibility
export { createRateLimitAwareSolanaConnection as createRateLimitAwareConnection };

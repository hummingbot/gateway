/**
 * Generic RPC connection interceptor for rate limit detection
 * Works with both Solana (@solana/web3.js Connection) and Ethereum (ethers Provider)
 */

import { Connection } from '@solana/web3.js';
import { providers } from 'ethers';

import { logger } from './logger';

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

/**
 * Create error message based on chain type
 */
function createRateLimitErrorMessage(rpcUrl: string, chainType: 'solana' | 'ethereum'): string {
  const redactedUrl = redactUrl(rpcUrl);

  if (chainType === 'solana') {
    return (
      `Solana RPC rate limit exceeded. Your current RPC endpoint (${redactedUrl}) has reached its rate limit. ` +
      `Please configure a different RPC endpoint with higher rate limits, or use a managed provider like Helius. ` +
      `To fix: Update 'nodeURL' in conf/chains/solana/${rpcUrl.includes('devnet') ? 'devnet' : 'mainnet-beta'}.yml ` +
      `or configure Helius in conf/rpc/helius.yml`
    );
  } else {
    // Ethereum
    const network = rpcUrl.includes('sepolia')
      ? 'sepolia'
      : rpcUrl.includes('polygon')
        ? 'polygon'
        : rpcUrl.includes('arbitrum')
          ? 'arbitrum'
          : rpcUrl.includes('optimism')
            ? 'optimism'
            : rpcUrl.includes('base')
              ? 'base'
              : rpcUrl.includes('avalanche')
                ? 'avalanche'
                : rpcUrl.includes('bsc') || rpcUrl.includes('binance')
                  ? 'bsc'
                  : 'mainnet';

    return (
      `Ethereum RPC rate limit exceeded. Your current RPC endpoint (${redactedUrl}) has reached its rate limit. ` +
      `Please configure a different RPC endpoint with higher rate limits, or use a managed provider like Infura. ` +
      `To fix: Update 'nodeURL' in conf/chains/ethereum/${network}.yml ` +
      `or configure Infura in conf/rpc/infura.yml`
    );
  }
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
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return await (value as (...args: any[]) => any).apply(target, args);
        } catch (error: any) {
          if (is429Error(error)) {
            const redactedUrl = redactUrl(rpcUrl);
            logger.error(`⚠️  Solana RPC rate limit exceeded: ${redactedUrl}, method: ${String(prop)}`);
            logger.error(`Original error: ${error.message}`);

            // Create error with statusCode property that Fastify's error handler recognizes
            const rateLimitError: any = new Error(createRateLimitErrorMessage(rpcUrl, 'solana'));
            rateLimitError.statusCode = 429;
            rateLimitError.name = 'TooManyRequestsError';
            throw rateLimitError;
          }
          throw error;
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

            // Create error with statusCode property that Fastify's error handler recognizes
            const rateLimitError: any = new Error(createRateLimitErrorMessage(rpcUrl, 'ethereum'));
            rateLimitError.statusCode = 429;
            rateLimitError.name = 'TooManyRequestsError';
            throw rateLimitError;
          }
          throw error;
        }
      };
    },
  }) as T;
}

// Legacy export for backward compatibility
export { createRateLimitAwareSolanaConnection as createRateLimitAwareConnection };

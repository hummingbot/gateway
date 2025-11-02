import { Connection } from '@solana/web3.js';

import { logger } from '../../services/logger';

/**
 * Detect if an error is a 429 rate limit error
 */
function is429Error(error: any): boolean {
  if (!error) return false;

  const errorStr = JSON.stringify(error);

  // Check various ways 429 might appear in Solana RPC errors
  return (
    error?.message?.includes('429') ||
    error?.message?.toLowerCase().includes('too many requests') ||
    error?.code === 429 ||
    error?.status === 429 ||
    error?.response?.status === 429 ||
    errorStr.includes('"code": 429') ||
    errorStr.includes('"code":429')
  );
}

/**
 * Create a rate-limit aware Connection using Proxy pattern
 * Intercepts all Connection methods and throws 429 errors with proper message
 *
 * @param connection - The Solana Connection instance to wrap
 * @param rpcUrl - The RPC URL for error messages
 * @returns Proxied Connection that throws errors with statusCode 429 on rate limits
 */
export function createRateLimitAwareConnection(connection: Connection, rpcUrl: string): Connection {
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
            logger.error(`⚠️  Solana RPC rate limit exceeded: ${rpcUrl}, method: ${String(prop)}`);
            logger.error(`Original error: ${error.message}`);

            // Create error with statusCode property that Fastify's error handler recognizes
            const rateLimitError: any = new Error(
              `Solana RPC rate limit exceeded. Your current RPC endpoint (${rpcUrl}) has reached its rate limit. ` +
                `Please configure a different RPC endpoint with higher rate limits, or use a managed provider like Helius. ` +
                `To fix: Update 'nodeURL' in conf/chains/solana/${rpcUrl.includes('devnet') ? 'devnet' : 'mainnet-beta'}.yml ` +
                `or configure Helius in conf/rpc/helius.yml`,
            );
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

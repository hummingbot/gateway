import { Type } from '@sinclair/typebox';

import { getEthereumChainConfig, getEthereumNetworkConfig } from '../chains/ethereum/ethereum.config';
import { getSolanaChainConfig, getSolanaNetworkConfig } from '../chains/solana/solana.config';
import { httpErrors } from '../services/error-handler';
import { logger } from '../services/logger';
import { PoolService } from '../services/pool-service';

import { TradingType } from './connector-registry';

/** CLMM connectors that back the unified /trading/clmm routes. */
export const CLMM_CONNECTORS = ['meteora', 'raydium', 'pancakeswap-sol', 'orca', 'uniswap', 'pancakeswap'];

/** AMM connectors that back the unified /trading/amm routes. */
export const AMM_CONNECTORS = ['meteora', 'raydium', 'uniswap', 'pancakeswap'];

/** Connector selector: enum-constrained so unknown connectors are rejected at the schema. */
export const connectorField = (connectors: string[], label: string) =>
  Type.String({ description: label, enum: connectors, default: connectors[0], examples: [connectors[0]] });

/** Chain-network selector shared by every unified trading route. */
export const chainNetworkField = () =>
  Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
    examples: ['solana-mainnet-beta'],
  });

/**
 * Optional slippage override shared by the unified trading routes. Deliberately
 * has NO schema default: Fastify injects schema defaults before the handler
 * runs, so a default here would shadow the connector-level defaults. When
 * omitted, each connector applies its own configured slippagePct (falling back
 * to 1 where the config has none).
 */
export const slippagePctField = (description?: string) =>
  Type.Optional(
    Type.Number({
      format: 'decimal',
      minimum: 0,
      maximum: 100,
      description:
        description ?? "Maximum acceptable slippage percentage. Defaults to the connector's configured slippagePct.",
      examples: [1],
    }),
  );

/**
 * Standard catch handler for the unified trading routes: errors that already
 * carry an HTTP status code (connector badRequest/notFound, chain errors) pass
 * through untouched; anything else becomes a 500 that keeps the underlying
 * message so callers see the real cause instead of a generic label.
 */
export function rethrowRouteError(e: any, context: string): never {
  logger.error(`${context}: ${e?.message ?? e}`);
  if (e?.statusCode) {
    throw e;
  }
  throw httpErrors.internalServerError(`${context}: ${e?.message ?? e}`);
}

/** Parse a chain-network string (e.g. "solana-mainnet-beta") into its chain and network parts. */
export function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const parts = chainNetwork.split('-');
  if (parts.length < 2) {
    throw httpErrors.badRequest(
      `Invalid chain-network format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)`,
    );
  }
  return { chain: parts[0], network: parts.slice(1).join('-') };
}

// Default wallet from Solana config, falling back to Ethereum when Solana is unavailable.
let dw: string;
try {
  dw = getSolanaChainConfig().defaultWallet;
} catch {
  dw = getEthereumChainConfig().defaultWallet;
}
export const defaultWallet = dw;

/** Wallet selector shared by the unified execute routes. */
export const walletAddressField = (description = 'Wallet address that will execute the transaction') =>
  Type.String({ description, default: defaultWallet });

/**
 * Pool pin for the pool-scoped (amm/clmm) swap routes. Optional: when omitted the
 * pool is resolved from Gateway's configured pool list by token pair, which a pool
 * that is not in that list (freshly created, unlisted token) cannot be — pass its
 * address here for those.
 */
export const poolAddressField = () =>
  Type.Optional(
    Type.String({
      description:
        "Pool to trade against. Omit to resolve it from Gateway's configured pool list by token pair; " +
        'pass an address to pin a pool that is not in that list.',
    }),
  );

/**
 * The connector a swap should use, honoring the network's configured swapProvider
 * when the caller names none.
 *
 * The config stores a provider as "connector/type" (e.g. "jupiter/router"), while
 * the unified routes carry the type in the path. So a configured default is only
 * usable on the route matching its type; on any other route, omitting the connector
 * is an error that names the config value rather than silently picking a connector.
 */
export function resolveSwapConnector(chain: string, network: string, type: TradingType, requested?: string): string {
  if (requested) {
    // Tolerate a typed value ("jupiter/router") so callers migrating from the old
    // /trading/swap routes are not broken by the path-carries-the-type change. The
    // route schemas constrain `connector` to bare names, so this path is reached by
    // internal callers (pool creation's market-price lookup) passing a config value.
    const [name, requestedType] = requested.split('/');
    if (requestedType && requestedType !== type) {
      throw httpErrors.badRequest(
        `Connector '${requested}' is a ${requestedType} provider, but this is a ${type} route. ` +
          `Use /trading/${requestedType}/ instead, or pass a ${type} connector.`,
      );
    }
    return name;
  }

  const swapProvider =
    chain === 'solana'
      ? getSolanaNetworkConfig(network)?.swapProvider
      : getEthereumNetworkConfig(network)?.swapProvider;

  if (!swapProvider) {
    throw httpErrors.badRequest(
      `No connector given and no swapProvider configured for ${chain}-${network}. Pass a connector.`,
    );
  }

  const [name, configuredType] = swapProvider.split('/');
  if (configuredType !== type) {
    throw httpErrors.badRequest(
      `No connector given. The configured swapProvider for ${chain}-${network} is '${swapProvider}', ` +
        `which is a ${configuredType} provider — pass a ${type} connector explicitly.`,
    );
  }
  return name;
}

/**
 * Pool address for a pool-scoped swap: the caller's pin when given, otherwise the
 * pair's pool from Gateway's configured list.
 */
export async function resolvePoolAddress(
  chain: string,
  network: string,
  type: 'clmm' | 'amm',
  connector: string,
  baseToken: string,
  quoteToken: string,
  requested?: string,
): Promise<string> {
  if (requested) return requested;

  const pool = await PoolService.getInstance().getPool(chain, network, type, baseToken, quoteToken, connector);
  if (!pool) {
    throw httpErrors.notFound(
      `No ${type.toUpperCase()} pool found for ${baseToken}-${quoteToken} on ${connector}/${network}. ` +
        'Pass poolAddress to trade against a specific pool.',
    );
  }
  logger.info(`Resolved pool ${pool.address} for ${baseToken}-${quoteToken} on ${connector}/${network}`);
  return pool.address;
}

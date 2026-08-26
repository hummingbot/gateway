import { Type } from '@sinclair/typebox';

import { getEthereumChainConfig, getEthereumNetworkConfig } from '../chains/ethereum/ethereum.config';
import { getSolanaChainConfig, getSolanaNetworkConfig } from '../chains/solana/solana.config';
import { DecimalNumber } from '../schemas/decimal-field';
import { parseChainNetwork as parseChainNetworkParts } from '../services/chain-network';
import { httpErrors } from '../services/error-handler';
import { logger } from '../services/logger';
import { PoolService } from '../services/pool-service';

import { assertConnectorOnChain, TradingType } from './connector-registry';

/**
 * The connector rosters the unified routes publish as their `connector` enum.
 *
 * Re-exported from the registry rather than listed again here: a second list is a
 * second thing to update, and the two silently disagreeing is how a connector ends up
 * offered by a schema that nothing can dispatch.
 */
export { AMM_CONNECTORS, CLMM_CONNECTORS } from './connector-registry';

/**
 * The chain-network selector and the roster behind it, defined in `services/chain-network`
 * so the pool and token routes can share the one field rather than each declaring its own.
 */
export { chainNetworkField, SUPPORTED_CHAIN_NETWORKS } from '../schemas/chain-network-field';

/** Connector selector: enum-constrained so unknown connectors are rejected at the schema. */
/**
 * The venue to act on.
 *
 * `defaulted: false` on every route that signs. AJV injects schema defaults before the
 * handler runs, so a default here answers "which venue?" for a caller who never said —
 * and the answer is whichever connector happens to be first in the registry. On a read
 * that is a convenience; on a write it picks a venue for someone's money. The reads keep
 * it, which is also what fills the Swagger form.
 */
export const connectorField = (connectors: string[], label: string, { defaulted = true } = {}) =>
  Type.String({
    description: label,
    enum: connectors,
    ...(defaulted ? { default: connectors[0] } : {}),
    examples: [connectors[0]],
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

/**
 * Resolve a `chain-network` selector for a pool-scoped route, against the connector it
 * was sent with.
 *
 * `parseChainNetwork` returns whatever it split, so a route that reads only the network
 * half dispatches on the connector alone and the chain is decorative: `ethereum-mainnet`
 * with a Solana connector ran that connector on `mainnet`, and a chain that exists
 * nowhere ran it, successfully, on the network half. Every route that names one
 * connector for one pool should resolve its selector through here, so the pair is
 * checked once, in the same place, with the same message the swap routes give.
 */
export function resolveChainNetwork(
  chainNetwork: string,
  connector: string,
  type: 'clmm' | 'amm',
): { chain: string; network: string } {
  const { chain, network } = parseChainNetwork(chainNetwork);
  assertConnectorOnChain(connector, chain, type);
  return { chain, network };
}

/**
 * Parse a chain-network string (e.g. "solana-mainnet-beta") into its chain and network.
 *
 * The split itself lives in `services/chain-network`; what this adds is the HTTP framing,
 * so a malformed selector reaches the caller as a 400 rather than a 500.
 */
export function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  try {
    return parseChainNetworkParts(chainNetwork);
  } catch (e: any) {
    throw httpErrors.badRequest(e.message);
  }
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

/**
 * Stamp the identifiers a write acted on onto its confirmed result.
 *
 * A settled transaction should say which pool and position it touched without the
 * caller holding on to the request that produced it — the same reason the swap
 * execute responses carry `poolAddress`. Only the confirmed `data` block is
 * decorated: a submitted-but-unconfirmed response has no data, and inventing one
 * would claim the write landed.
 *
 * Undefined identifiers are dropped rather than written as undefined, so a
 * fungible-LP AMM (which has no position) simply has no positionAddress.
 */
export function withIdentifiers<T extends { data?: Record<string, any> }>(
  result: T,
  identifiers: { poolAddress?: string; positionAddress?: string },
): T {
  if (!result?.data) return result;

  const stamped = { ...result.data };
  for (const [key, value] of Object.entries(identifiers)) {
    if (value !== undefined) stamped[key] = value;
  }
  return { ...result, data: stamped };
}

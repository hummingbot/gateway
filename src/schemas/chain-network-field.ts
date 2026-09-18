import { Type } from '@sinclair/typebox';

import { ConfigManagerV2 } from '../services/config-manager-v2';

/**
 * Every chain-network Gateway is configured for, read from its config namespaces.
 *
 * This is the enum on `chainNetworkField`, so an unconfigured or malformed selector is
 * rejected by the schema rather than split into parts and half-used. Read at load rather
 * than listed, so adding a network's config is the only step.
 */
export const SUPPORTED_CHAIN_NETWORKS = ConfigManagerV2.getInstance().getSupportedChainNetworks();

export const DEFAULT_CHAIN_NETWORK = 'solana-mainnet-beta';

if (!SUPPORTED_CHAIN_NETWORKS.includes(DEFAULT_CHAIN_NETWORK)) {
  // Fastify injects a schema default before the handler runs, so a default outside the
  // enum would make every request that omits chainNetwork fail its own validation.
  throw new Error(
    `Routes default chainNetwork to '${DEFAULT_CHAIN_NETWORK}', which is not among the configured ` +
      `chain-networks: ${SUPPORTED_CHAIN_NETWORKS.join(', ') || '(none)'}. ` +
      'Restore that namespace under conf/, or change the default.',
  );
}

/**
 * The chain-network selector, for every route that is not already addressed by a `chain`
 * path parameter.
 *
 * One field so one convention: `/pools` and `/tokens` used to take `chain` and `network`
 * separately on some routes and `chainNetwork` on others — the same resource addressed two
 * ways inside a single router, which a caller had to learn route by route.
 */
export const chainNetworkField = ({ defaulted = true, description }: ChainNetworkFieldOptions = {}) =>
  Type.String({
    description:
      description ?? 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    enum: SUPPORTED_CHAIN_NETWORKS,
    // A default is a convenience on a route that reads, and a hazard on one that writes:
    // Fastify injects it before the handler runs, so `DELETE /pools/{address}` with no
    // chainNetwork would pick a network and delete from it. The data-management routes
    // ask for it rather than guess.
    ...(defaulted ? { default: DEFAULT_CHAIN_NETWORK } : {}),
    examples: [DEFAULT_CHAIN_NETWORK],
  });

export interface ChainNetworkFieldOptions {
  /** Whether omitting it means the default chain-network. False where guessing is unsafe. */
  defaulted?: boolean;
  description?: string;
}

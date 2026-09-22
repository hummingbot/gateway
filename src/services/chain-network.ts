/**
 * Reading a `chain-network` selector, in one place.
 *
 * Three implementations had grown apart, and the differences were not stylistic. The one
 * in `trading/common.ts` rejected a value with no hyphen; `ConfigManagerV2`'s accepted
 * anything and answered `{ chain: 'solana', network: '' }` for `"solana"`; and
 * `pools/routes/findPools.ts` hand-rolled `split('-').slice(1).join('-')` inline, which
 * did the same silently. A caller could therefore be rejected or quietly given an empty
 * network depending on which route it reached.
 *
 * The message deliberately contains "Invalid chainNetwork": `handlePoolError` matches on
 * that to answer 400, so the pools routes report a malformed selector as the caller's
 * error rather than as a Gateway failure.
 *
 * Not to be confused with `parseChainNetworkNamespace` in `config/utils.ts`, which asks a
 * different question — whether a *config namespace* is a chain-network one at all — and
 * answers null rather than throwing.
 */

/** Split `chain-network` into its parts. Throws when it is not in that form. */
export function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const [chain, ...networkParts] = (chainNetwork ?? '').split('-');
  const network = networkParts.join('-');

  if (!chain || !network) {
    throw new Error(
      `Invalid chainNetwork '${chainNetwork}': expected chain-network, ` +
        'for example solana-mainnet-beta or ethereum-mainnet.',
    );
  }

  return { chain, network };
}

/**
 * Every route that sends a transaction, with its stateless build twin (#682).
 *
 * A route here signs through its chain's chokepoint (the signer seam). Its `buildTwin`
 * runs the same connector code and returns the unsigned transaction instead, for the
 * caller to sign and send with POST /chains/{chain}/submit. `gaps` names the chains on
 * which the twin cannot serve the route yet, and the task that closes each gap.
 *
 * test/wallet/transaction-routes.test.ts checks this table against the registered
 * routes: a new POST or DELETE route fails the test until it is listed here or in
 * NON_SENDING_ROUTES. The refusal of an execute request for an external wallet reads
 * the twin from here.
 */
import { WalletChain } from './types';

export interface TransactionRoute {
  /** Fastify route URL, with its parameters (`/chains/:chain/wrap`). */
  url: string;
  chains: WalletChain[];
  /** The build route that serves the same operation, if one exists. */
  buildTwin?: string;
  /** Chains on which the operation has no working build twin yet, with the task that adds it. */
  gaps?: Partial<Record<WalletChain, string>>;
}

const EVM_BUILD = 'INV-438';
const SOLANA_BUILD = 'INV-435';

export const TRANSACTION_ROUTES: TransactionRoute[] = [
  // Router
  {
    url: '/trading/router/execute-swap',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/router/build-swap',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/router/execute-quote',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/router/build-quote',
    gaps: { ethereum: EVM_BUILD },
  },
  // CLMM
  {
    url: '/trading/clmm/execute-swap',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-swap',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/clmm/open',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-open',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/clmm/add',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-add',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/clmm/remove',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-remove',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/clmm/collect-fees',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-collect-fees',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/clmm/close',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-close',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/clmm/create-pool',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-create-pool',
    gaps: { ethereum: EVM_BUILD },
  },
  // AMM
  {
    url: '/trading/amm/execute-swap',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-swap',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/amm/add',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-add',
    gaps: { ethereum: EVM_BUILD },
  },
  {
    url: '/trading/amm/remove',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-remove',
    gaps: { ethereum: EVM_BUILD },
  },
  // Meteora DAMM v2 only.
  { url: '/trading/amm/collect-fees', chains: ['solana'], buildTwin: '/trading/amm/build-collect-fees' },
  {
    url: '/trading/amm/create-pool',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-create-pool',
    gaps: { ethereum: EVM_BUILD },
  },
  // Launch (Solana only)
  { url: '/trading/launch/execute-swap', chains: ['solana'], buildTwin: '/trading/launch/build-swap' },
  { url: '/trading/launch/execute-quote', chains: ['solana'], gaps: { solana: SOLANA_BUILD } },
  { url: '/trading/launch/create-token', chains: ['solana'], buildTwin: '/trading/launch/build-create-token' },
  {
    url: '/trading/launch/claim-creator-fees',
    chains: ['solana'],
    buildTwin: '/trading/launch/build-claim-creator-fees',
  },
  { url: '/trading/launch/migrate', chains: ['solana'], buildTwin: '/trading/launch/build-migrate' },
  // Chain operations
  {
    url: '/chains/:chain/wrap',
    chains: ['solana', 'ethereum'],
    gaps: { solana: SOLANA_BUILD, ethereum: EVM_BUILD },
  },
  {
    url: '/chains/:chain/unwrap',
    chains: ['solana', 'ethereum'],
    gaps: { solana: SOLANA_BUILD, ethereum: EVM_BUILD },
  },
  { url: '/chains/ethereum/approve', chains: ['ethereum'], gaps: { ethereum: EVM_BUILD } },
];

/**
 * POST and DELETE routes that send no transaction for a wallet: build routes (they sign
 * nothing), submit (the caller signed), reads that take a body, and configuration.
 */
export const NON_SENDING_ROUTES: string[] = [
  'POST /chains/:chain/submit',
  'POST /chains/:chain/build-transaction',
  'POST /chains/:chain/balances',
  'POST /chains/:chain/poll',
  'POST /chains/ethereum/allowances',
  'POST /config/update',
  'POST /restart',
  'POST /wallet/add',
  'POST /wallet/add-hardware',
  'POST /wallet/add-external',
  'POST /wallet/add-privy',
  'POST /wallet/create-privy',
  'POST /wallet/setDefault',
  'DELETE /wallet/remove',
  'POST /tokens',
  'POST /tokens/save/:address',
  'DELETE /tokens/:address',
  'POST /pools',
  'POST /pools/save/:address',
  'DELETE /pools/:address',
];

/**
 * The build twin that serves a transaction route on a chain, with `:chain` filled in;
 * undefined when the route has none there yet.
 */
export function buildTwinOf(method: string, url: string, chain: WalletChain): string | undefined {
  if (method !== 'POST') return undefined;
  const route = TRANSACTION_ROUTES.find((r) => r.url === url);
  if (!route?.buildTwin || route.gaps?.[chain]) return undefined;
  return route.buildTwin.replace(':chain', chain);
}

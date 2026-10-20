/**
 * Every route that sends a transaction, with its stateless build twin (#682).
 *
 * A route here signs through its chain's chokepoint (the signer seam). Its `buildTwin`
 * runs the same connector code and returns the unsigned transaction instead, for the
 * caller to sign and send with POST /chains/{chain}/submit. Every route has one.
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
  /** The build route that serves the same operation on every chain the route serves. */
  buildTwin: string;
}

export const TRANSACTION_ROUTES: TransactionRoute[] = [
  // Router
  {
    url: '/trading/router/execute-swap',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/router/build-swap',
  },
  {
    url: '/trading/router/execute-quote',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/router/build-quote',
  },
  // CLMM
  {
    url: '/trading/clmm/execute-swap',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-swap',
  },
  {
    url: '/trading/clmm/open',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-open',
  },
  {
    url: '/trading/clmm/add',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-add',
  },
  {
    url: '/trading/clmm/remove',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-remove',
  },
  {
    url: '/trading/clmm/collect-fees',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-collect-fees',
  },
  {
    url: '/trading/clmm/close',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-close',
  },
  {
    url: '/trading/clmm/create-pool',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/clmm/build-create-pool',
  },
  // AMM
  {
    url: '/trading/amm/execute-swap',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-swap',
  },
  {
    url: '/trading/amm/add',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-add',
  },
  {
    url: '/trading/amm/remove',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-remove',
  },
  // Meteora DAMM v2 only.
  { url: '/trading/amm/collect-fees', chains: ['solana'], buildTwin: '/trading/amm/build-collect-fees' },
  {
    url: '/trading/amm/create-pool',
    chains: ['solana', 'ethereum'],
    buildTwin: '/trading/amm/build-create-pool',
  },
  // Launch (Solana only)
  { url: '/trading/launch/execute-swap', chains: ['solana'], buildTwin: '/trading/launch/build-swap' },
  { url: '/trading/launch/execute-quote', chains: ['solana'], buildTwin: '/trading/launch/build-quote' },
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
    buildTwin: '/chains/:chain/build-wrap',
  },
  {
    url: '/chains/:chain/unwrap',
    chains: ['solana', 'ethereum'],
    buildTwin: '/chains/:chain/build-unwrap',
  },
  { url: '/chains/ethereum/approve', chains: ['ethereum'], buildTwin: '/chains/ethereum/build-approve' },
];

/**
 * POST and DELETE routes that send no transaction for a wallet: build routes (they sign
 * nothing), submit (the caller signed), reads that take a body, and configuration.
 */
export const NON_SENDING_ROUTES: string[] = [
  'POST /chains/:chain/submit',
  'POST /chains/:chain/build-transaction',
  'POST /chains/:chain/build-wrap',
  'POST /chains/:chain/build-unwrap',
  'POST /chains/ethereum/build-approve',
  'POST /chains/:chain/balances',
  'POST /chains/:chain/poll',
  'POST /chains/ethereum/allowances',
  'POST /config/update',
  'POST /restart',
  'POST /wallet/add',
  'POST /wallet/add-hardware',
  'POST /wallet/add-external',
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
 * undefined for a route this table does not list.
 */
export function buildTwinOf(method: string, url: string, chain: WalletChain): string | undefined {
  if (method !== 'POST') return undefined;
  const route = TRANSACTION_ROUTES.find((r) => r.url === url);
  if (!route || !route.chains.includes(chain)) return undefined;
  return route.buildTwin.replace(':chain', chain);
}

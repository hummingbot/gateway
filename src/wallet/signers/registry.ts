/**
 * Signer backends by kind, and the lookup the chokepoints use: address -> wallet record
 * -> that kind's signer. A new backend adds one entry to `signerBackends`.
 */
import { AsyncLocalStorage } from 'async_hooks';

import { FastifyInstance } from 'fastify';

import { httpErrors } from '../../services/error-handler';

import { externalBackend } from './external';
import { hardwareBackend } from './hardware';
import { localBackend } from './local';
import { privyBackend } from './privy';
import { buildTwinOf } from './transaction-routes';
import { EthereumSigner, SignerFactories, SignerKind, SolanaSigner, WalletChain } from './types';
import { getWalletRecord } from './wallet-store';

export const signerBackends: Partial<Record<SignerKind, SignerFactories>> = {
  local: localBackend,
  hardware: hardwareBackend,
  external: externalBackend,
  privy: privyBackend,
};

function backendFor(kind: SignerKind, address: string): SignerFactories {
  const backend = signerBackends[kind];
  if (!backend) {
    throw httpErrors.internalServerError(
      `Wallet ${address} uses the '${kind}' signer, which this Gateway build does not include`,
    );
  }
  return backend;
}

export async function getSolanaSigner(address: string): Promise<SolanaSigner> {
  const record = await getWalletRecord('solana', address);
  return backendFor(record.signer, address).solana(record);
}

export async function getEthereumSigner(address: string): Promise<EthereumSigner> {
  const record = await getWalletRecord('ethereum', address);
  return backendFor(record.signer, address).ethereum(record);
}

/** The route a request was sent to, so the seam can name its build twin. */
const requestRoute = new AsyncLocalStorage<{ method: string; url: string }>();

/**
 * Record each request's route for the seam. preHandler, so the store is entered after
 * the body is parsed and holds for the handler and everything it awaits.
 */
export function trackRequestRoute(server: FastifyInstance): void {
  server.addHook('preHandler', (request, _reply, done) => {
    requestRoute.run({ method: request.method, url: request.routeOptions.url ?? request.url }, done);
  });
}

/**
 * The refusal of an execute request for a wallet whose signer returned `unsigned`:
 * a 400 that names the route's build twin and the submit route.
 */
export function externalWalletRefusal(chain: WalletChain, address: string, reason: string): Error {
  const route = requestRoute.getStore();
  const twin = route ? buildTwinOf(route.method, route.url, chain) : undefined;
  const prefix = `Wallet ${address} is an external wallet: ${reason}, so it cannot sign this request.`;
  if (!twin) {
    return httpErrors.badRequest(
      `${prefix} No build route serves this operation on ${chain} yet; sign it with a local or hardware wallet.`,
    );
  }
  return httpErrors.badRequest(
    `${prefix} Use POST ${twin} to build the unsigned transaction, sign it with the wallet's own key, ` +
      `and send it with POST /chains/${chain}/submit.`,
  );
}

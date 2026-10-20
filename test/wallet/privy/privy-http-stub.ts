/**
 * Stubs Privy at the HTTP edge: global fetch answers requests to api.privy.io from a
 * route table and records each request. Nothing inside Gateway's Privy code is mocked.
 */
import { createPublicKey, generateKeyPairSync, KeyObject, verify } from 'crypto';

import { authorizationPayload, PRIVY_API_URL } from '../../../src/wallet/privy/privy-client';

export interface RecordedPrivyRequest {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body: any;
}

export type PrivyRoute = (req: RecordedPrivyRequest) => { status: number; body: unknown };

export const TEST_APP_ID = 'test-app-id';
export const TEST_APP_SECRET = 'test-app-secret';

export function setPrivyEnv(): { publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.PRIVY_APP_ID = TEST_APP_ID;
  process.env.PRIVY_APP_SECRET = TEST_APP_SECRET;
  process.env.PRIVY_AUTHORIZATION_KEY =
    'wallet-auth:' + privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  return { publicKey: createPublicKey(privateKey) };
}

export function clearPrivyEnv(): void {
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.PRIVY_AUTHORIZATION_KEY;
}

/** Routes are keyed `METHOD /path`. An unrouted request fails the test. */
export function stubPrivyHttp(routes: Record<string, PrivyRoute>): RecordedPrivyRequest[] {
  const requests: RecordedPrivyRequest[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input: any, init: any = {}) => {
    const url = String(input);
    if (!url.startsWith(PRIVY_API_URL)) {
      throw new Error(`Unexpected fetch outside Privy: ${url}`);
    }
    const path = url.slice(PRIVY_API_URL.length);
    const req: RecordedPrivyRequest = {
      method: init.method ?? 'GET',
      url,
      path,
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    requests.push(req);
    const route = routes[`${req.method} ${path}`];
    if (!route) {
      throw new Error(`No Privy stub for ${req.method} ${path}`);
    }
    const { status, body } = route(req);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  return requests;
}

/** True when the request carries a valid authorization signature from the given key. */
export function hasValidAuthorizationSignature(req: RecordedPrivyRequest, publicKey: KeyObject): boolean {
  const payload = authorizationPayload({
    method: 'POST',
    url: req.url,
    body: req.body,
    headers: {
      'privy-app-id': req.headers['privy-app-id'],
      'privy-request-expiry': req.headers['privy-request-expiry'],
    },
  });
  const signature = new Uint8Array(Buffer.from(req.headers['privy-authorization-signature'], 'base64'));
  return verify('sha256', payload, publicKey, signature);
}

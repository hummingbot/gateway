/**
 * Privy server-wallet REST client (https://docs.privy.io/api-reference).
 *
 * Gateway uses Privy as a signer only: it builds the transaction, Privy signs it inside
 * its enclave (enforcing any policy attached to the wallet), and Gateway submits it.
 *
 * Credentials come from the environment only, never from conf files or request bodies:
 *   PRIVY_APP_ID             the Privy app id
 *   PRIVY_APP_SECRET         the Privy app secret (HTTP Basic auth)
 *   PRIVY_AUTHORIZATION_KEY  the P-256 authorization key (`wallet-auth:<base64 PKCS8>`)
 *                            that owns Gateway's Privy wallets. It signs every wallet
 *                            RPC request (`privy-authorization-signature` header).
 *
 * The request signature follows @privy-io/node `lib/authorization.ts`: an RFC 8785
 * canonical JSON payload `{version: 1, method, url, body, headers}` signed with ECDSA
 * P-256 / SHA-256, low-S, DER, base64.
 */
import { createPrivateKey, createPublicKey, KeyObject, sign as cryptoSign } from 'crypto';

import canonicalize from 'canonicalize';

import { logger } from '../../services/logger';

export const PRIVY_API_URL = 'https://api.privy.io';

const REQUEST_TIMEOUT_MS = 30_000;
const REQUEST_EXPIRY_MS = 15 * 60 * 1000;

/** Privy wallet ids are lowercase alphanumeric (cuid2). Anything else never reaches a URL. */
const PRIVY_WALLET_ID_PATTERN = /^[a-z0-9]{16,64}$/;

const AUTHORIZATION_KEY_PREFIX = 'wallet-auth:';

// Order of the P-256 group, for low-S normalization (the Privy SDK signs low-S).
const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

export type PrivyChainType = 'solana' | 'ethereum';

export interface PrivyWallet {
  id: string;
  address: string;
  chain_type: string;
  owner_id: string | null;
  policy_ids: string[];
}

/** UnsignedStandardEthereumTransaction in Privy's API: quantities as 0x hex strings. */
export interface PrivyEthereumTransaction {
  from: string;
  to: string;
  chain_id: string;
  nonce: string;
  data: string;
  value: string;
  gas_limit: string;
  type: 0 | 2;
  gas_price?: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
}

/** An error from Privy or from Gateway's Privy configuration, with the HTTP status Gateway returns. */
export class PrivyError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'PrivyError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function validatePrivyWalletId(walletId: unknown): string {
  if (typeof walletId !== 'string' || !PRIVY_WALLET_ID_PATTERN.test(walletId)) {
    throw new PrivyError(400, 'Invalid Privy wallet id: expected 16-64 lowercase letters and digits');
  }
  return walletId;
}

interface PrivyCredentials {
  appId: string;
  appSecret: string;
}

function readCredentials(): PrivyCredentials {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new PrivyError(
      503,
      'Privy is not configured: set PRIVY_APP_ID and PRIVY_APP_SECRET in the environment Gateway runs in',
    );
  }
  return { appId, appSecret };
}

function readAuthorizationKey(): KeyObject {
  const raw = process.env.PRIVY_AUTHORIZATION_KEY;
  if (!raw) {
    throw new PrivyError(
      503,
      'Privy authorization key is not configured: set PRIVY_AUTHORIZATION_KEY (wallet-auth:<base64 PKCS8>) in the environment Gateway runs in',
    );
  }
  const der = raw.replace(/\s/g, '').replace(AUTHORIZATION_KEY_PREFIX, '');
  try {
    const key = createPrivateKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      throw new Error('not a P-256 key');
    }
    return key;
  } catch {
    throw new PrivyError(
      503,
      'PRIVY_AUTHORIZATION_KEY is not a P-256 private key in the form wallet-auth:<base64 PKCS8>',
    );
  }
}

/** Base64 SPKI public key of PRIVY_AUTHORIZATION_KEY: the owner Gateway sets on wallets it creates. */
export function authorizationPublicKey(): string {
  return createPublicKey(readAuthorizationKey()).export({ format: 'der', type: 'spki' }).toString('base64');
}

/** The exact bytes Privy verifies the authorization signature over. */
export function authorizationPayload(input: {
  method: 'POST';
  url: string;
  body: unknown;
  headers: Record<string, string>;
}): Uint8Array {
  const serialized = canonicalize({ version: 1, ...input });
  if (!serialized) {
    throw new Error('Failed to canonicalize the Privy authorization payload');
  }
  return new TextEncoder().encode(serialized);
}

function hexByte(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/** DER INTEGER (hex) for an unsigned big-endian value. */
function derInteger(value: bigint): string {
  let hex = value.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  if (parseInt(hex.slice(0, 2), 16) & 0x80) hex = '00' + hex;
  return '02' + hexByte(hex.length / 2) + hex;
}

/** ECDSA P-256 / SHA-256 over the payload, normalized to low-S, DER encoded, base64. */
export function signAuthorizationPayload(payload: Uint8Array, key: KeyObject): string {
  const raw = cryptoSign('sha256', payload, { key, dsaEncoding: 'ieee-p1363' }).toString('hex');
  const r = BigInt('0x' + raw.slice(0, 64));
  let s = BigInt('0x' + raw.slice(64));
  if (s > P256_N / BigInt(2)) s = P256_N - s;
  const body = derInteger(r) + derInteger(s);
  return Buffer.from('30' + hexByte(body.length / 2) + body, 'hex').toString('base64');
}

interface PrivyErrorBody {
  error?: string;
  code?: string;
}

function mapPrivyError(
  operation: string,
  walletId: string | undefined,
  status: number,
  body: PrivyErrorBody,
): PrivyError {
  const code = typeof body.code === 'string' ? body.code : undefined;
  const text = typeof body.error === 'string' ? body.error : '';
  const wallet = walletId ? `Privy wallet ${walletId}` : 'Privy';

  if (code === 'policy_violation') {
    return new PrivyError(403, `${wallet} refused to sign: the request violates a policy attached to the wallet`, code);
  }
  if (status === 401 && /authorization.signature|authorization key|signature/i.test(text)) {
    return new PrivyError(
      403,
      `${wallet} refused the request signature: PRIVY_AUTHORIZATION_KEY must be the private key of an owner or signer of the wallet`,
      code,
    );
  }
  if (status === 401) {
    return new PrivyError(503, 'Privy rejected the app credentials: check PRIVY_APP_ID and PRIVY_APP_SECRET', code);
  }
  if (status === 403) {
    return new PrivyError(403, `${wallet} is not accessible with this Privy app (${operation})`, code);
  }
  if (status === 404) {
    return new PrivyError(
      404,
      walletId ? `Privy wallet ${walletId} not found in this Privy app` : 'Privy resource not found',
      code,
    );
  }
  if (status === 429) {
    return new PrivyError(429, `Privy rate limit reached (${operation}); retry later`, code);
  }
  if (status >= 400 && status < 500) {
    return new PrivyError(400, `Privy rejected ${operation} (HTTP ${status}${code ? `, ${code}` : ''})`, code);
  }
  return new PrivyError(502, `Privy ${operation} failed (HTTP ${status})`, code);
}

async function privyRequest<T>(
  operation: string,
  walletId: string | undefined,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  signed = false,
): Promise<T> {
  const { appId, appSecret } = readCredentials();
  const url = `${PRIVY_API_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    'privy-app-id': appId,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (signed) {
    const expiry = String(Date.now() + REQUEST_EXPIRY_MS);
    const payload = authorizationPayload({
      method: 'POST',
      url,
      body,
      headers: { 'privy-app-id': appId, 'privy-request-expiry': expiry },
    });
    headers['privy-request-expiry'] = expiry;
    headers['privy-authorization-signature'] = signAuthorizationPayload(payload, readAuthorizationKey());
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn(`Privy ${operation}: request failed: ${error.message}`);
    throw new PrivyError(502, `Privy API unreachable (${operation}): ${error.message}`);
  }

  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new PrivyError(502, `Privy ${operation} returned a non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const mapped = mapPrivyError(operation, walletId, response.status, json);
    // Privy's error text stays out of responses and normal logs; it can carry trace ids.
    logger.warn(`Privy ${operation}: HTTP ${response.status}${mapped.code ? ` (${mapped.code})` : ''}`);
    logger.debug(`Privy ${operation} error body: ${json.error ?? ''}`);
    throw mapped;
  }
  return json as T;
}

export async function getPrivyWallet(walletId: string): Promise<PrivyWallet> {
  const id = validatePrivyWalletId(walletId);
  return privyRequest<PrivyWallet>('get wallet', id, 'GET', `/v1/wallets/${encodeURIComponent(id)}`);
}

/** Creates a Privy wallet owned by PRIVY_AUTHORIZATION_KEY, so only Gateway's key can sign for it. */
export async function createPrivyWallet(chainType: PrivyChainType): Promise<PrivyWallet> {
  const body = { chain_type: chainType, owner: { public_key: authorizationPublicKey() } };
  return privyRequest<PrivyWallet>('create wallet', undefined, 'POST', '/v1/wallets', body);
}

async function walletRpc<T>(operation: string, walletId: string, body: Record<string, unknown>): Promise<T> {
  const id = validatePrivyWalletId(walletId);
  const response = await privyRequest<{ method: string; data: T }>(
    operation,
    id,
    'POST',
    `/v1/wallets/${encodeURIComponent(id)}/rpc`,
    body,
    true,
  );
  if (!response.data) {
    throw new PrivyError(502, `Privy ${operation} returned no data`);
  }
  return response.data;
}

/** Signs a serialized Solana transaction (base64); returns the signed transaction (base64). */
export async function privySignSolanaTransaction(walletId: string, transactionBase64: string): Promise<string> {
  const data = await walletRpc<{ signed_transaction: string }>('sign Solana transaction', walletId, {
    method: 'signTransaction',
    chain_type: 'solana',
    params: { transaction: transactionBase64, encoding: 'base64' },
  });
  return data.signed_transaction;
}

/** Signs a populated EVM transaction; returns the signed RLP-serialized transaction (0x hex). */
export async function privySignEthereumTransaction(
  walletId: string,
  transaction: PrivyEthereumTransaction,
): Promise<string> {
  const data = await walletRpc<{ signed_transaction: string }>('sign Ethereum transaction', walletId, {
    method: 'eth_signTransaction',
    chain_type: 'ethereum',
    params: { transaction },
  });
  return data.signed_transaction;
}

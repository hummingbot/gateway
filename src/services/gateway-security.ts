/**
 * Gateway network-security helpers (hummingbot/gateway#652, §1/§2/§4).
 *
 * Design principle: LOOPBACK IS TRUSTED. A request from 127.0.0.1/::1 is already on the
 * machine (where it could read the keystore anyway), so the new controls — API-token auth,
 * strict rate-limiting/lockout — apply ONLY to non-loopback (network-reachable) requests.
 * This keeps the normal local-bot experience completely unchanged (zero UX cost) while
 * hardening the case that actually matters: Gateway reachable over a network.
 *
 * Everything here is pure/Node-crypto only and unit-tested; no external dependency.
 */

import { randomBytes, timingSafeEqual } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

/** True for any loopback address form Node/Fastify may report. */
export function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const addr = ip.toLowerCase();
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1' || // IPv4-mapped IPv6
    addr === 'localhost' ||
    addr.startsWith('127.') // 127.0.0.0/8
  );
}

/** True when the bind host exposes Gateway beyond loopback (i.e. to the network). */
export function isExposedHost(host: string): boolean {
  return !isLoopbackAddress(host);
}

/** Path prefixes that move funds or reveal/modify secrets — gated behind auth when exposed. */
const SENSITIVE_PREFIXES = [/^\/wallet(\/|$)/, /^\/config\/update(\/|$)/, /^\/restart(\/|$)/];
const SENSITIVE_CONNECTOR = /^\/connectors\/[^/]+\/(amm|clmm|router)\/(execute|add|remove|open|close|collect)/i;
// Unified cross-chain trading namespace: only the fund-moving routes. Read-only routes
// (/trading/swap/quote, /trading/clmm/pool-info|position-info|positions-owned|quote-position)
// stay public by design.
const SENSITIVE_TRADING = /^\/trading\/(swap\/execute|clmm\/(open|add|remove|collect-fees|close))(\/|$)/i;

export function isSensitivePath(url: string): boolean {
  const pathOnly = url.split('?')[0];
  return (
    SENSITIVE_PREFIXES.some((re) => re.test(pathOnly)) ||
    SENSITIVE_CONNECTOR.test(pathOnly) ||
    SENSITIVE_TRADING.test(pathOnly)
  );
}

/**
 * Constant-time comparison of two secrets (used for the API token).
 *
 * A length check short-circuits first: the token has a fixed, non-secret length, so this
 * leaks nothing useful, and it lets `timingSafeEqual` (which requires equal-length inputs)
 * compare the contents in constant time. We deliberately do NOT pre-hash the inputs — a
 * 256-bit random bearer token is not a low-entropy password and needs no slow KDF; hashing
 * it with a fast digest would also (correctly) be flagged as an insufficient password hash.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a ?? '', 'utf8');
  const bb = Buffer.from(b ?? '', 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(new Uint8Array(ba), new Uint8Array(bb));
}

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authorization: string | undefined): string {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

/**
 * Load the Gateway API token, or generate a 256-bit one on first run.
 * Precedence: GATEWAY_API_KEY env > <confDir>/api-key file > generate + persist (0600).
 * The token authenticates network (non-loopback) requests; it is separate from the
 * wallet-encryption passphrase so the two secrets do not share a single point of failure.
 */
export function loadOrCreateApiKey(confDir: string): string {
  if (process.env.GATEWAY_API_KEY) return process.env.GATEWAY_API_KEY.trim();
  const keyPath = path.join(confDir, 'api-key');
  if (existsSync(keyPath)) {
    return readFileSync(keyPath, 'utf8').trim();
  }
  const key = randomBytes(32).toString('hex'); // 256-bit
  if (!existsSync(confDir)) mkdirSync(confDir, { recursive: true, mode: 0o700 });
  writeFileSync(keyPath, key, { mode: 0o600 });
  chmodSync(keyPath, 0o600); // enforce even if umask widened it
  return key;
}

/** The configured bind address (default loopback). Set GATEWAY_BIND_ADDRESS to expose. */
export function getBindAddress(): string {
  const fromEnv = process.env.GATEWAY_BIND_ADDRESS?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : '127.0.0.1';
}

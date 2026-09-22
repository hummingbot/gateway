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

/**
 * True for RFC1918 private ranges (10/8, 172.16/12, 192.168/16) and IPv6 unique-local
 * (fc00::/7) — i.e. a request that arrived over a private/container network rather than the
 * public internet. This is the address a co-located bot uses to reach Gateway: in the standard
 * Docker deployment the Hummingbot API calls `gateway:15888` over the compose bridge, so its
 * source IP is the bridge's private address (e.g. 172.18.0.x), NOT loopback.
 */
export function isPrivateNetworkAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  let addr = ip.toLowerCase().trim();
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:172.18.0.2) to its IPv4 form.
  if (addr.startsWith('::ffff:')) addr = addr.slice('::ffff:'.length);
  // IPv6 unique-local addresses (fc00::/7) — Docker's default IPv6 bridge subnet.
  if (/^f[cd][0-9a-f]*:/.test(addr)) return true;
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

/**
 * Clients trusted enough to skip the global rate limit: loopback plus the private/container
 * network. The rate limiter exists to throttle UNTRUSTED public clients; a co-located bot
 * (same host via loopback, or a sibling container over the bridge) is inside the trust
 * boundary that access control (opt-in API token + bind policy + mTLS) already governs, so it
 * must not be throttled. Public-internet sources still get the limit. NOTE: this is NOT used
 * for auth — API-token auth stays loopback-only so enabling it still forces a bridged client
 * to present the token.
 */
export function isTrustedLocalAddress(ip: string | undefined): boolean {
  return isLoopbackAddress(ip) || isPrivateNetworkAddress(ip);
}

/** Path prefixes that move funds or reveal/modify secrets — gated behind auth when exposed. */
const SENSITIVE_PREFIXES = [/^\/wallet(\/|$)/, /^\/config\/update(\/|$)/, /^\/restart(\/|$)/];
// Unified trading namespace: only the fund-moving routes. Read-only routes
// (quote-swap, quote-liquidity, pool-info, position-info,
// positions-owned, fetch-pools) stay public by design.
//
// This one pattern replaced a second one that covered the removed /connectors/*
// surface, so it has to cover every fund-moving verb that surface carried —
// including the AMM add/remove/create-pool routes, which the previous /trading
// pattern omitted only because /connectors was still gating them.
const SENSITIVE_TRADING =
  /^\/trading\/(router\/(execute-swap|execute-quote)|(clmm|amm)\/(execute-swap|open|close|add|remove|collect-fees|create-pool))(\/|$)/i;

// Chain-level routes that sign with the hot wallet. `approve` is the sharpest of them —
// an unauthenticated caller reaching it can have the wallet approve an unlimited
// allowance to an address of their choosing and then drain every ERC-20 the wallet holds,
// without ever touching a route the patterns above cover. `wrap`/`unwrap` sign and move
// the native balance. The read-only chain routes (status, estimate-gas, balances, poll,
// allowances) stay public, as the read-only trading routes do: nothing signs, and gating
// them would break a co-located bot's polling for no security gain.
const SENSITIVE_CHAINS = /^\/chains\/[^/]+\/(approve|wrap|unwrap)(\/|$)/i;

export function isSensitivePath(url: string): boolean {
  const pathOnly = url.split('?')[0];
  return (
    SENSITIVE_PREFIXES.some((re) => re.test(pathOnly)) ||
    SENSITIVE_TRADING.test(pathOnly) ||
    SENSITIVE_CHAINS.test(pathOnly)
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

/**
 * True when Gateway is running inside a container (Docker/Podman). Uses the same markers the
 * Hummingbot API relies on, so the two stay in agreement about the deployment shape.
 */
export function isRunningInContainer(): boolean {
  return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
}

/**
 * The configured bind address. Precedence:
 *   1. GATEWAY_BIND_ADDRESS — explicit override always wins.
 *   2. 0.0.0.0 when running inside a container — the container must be reachable from sibling
 *      containers (e.g. the Hummingbot API calling `https://gateway:15888`, or a bridged
 *      client). Inside a container the network boundary is the HOST-PUBLISH policy (Gateway's
 *      own docker-compose publishes to 127.0.0.1 on the host; the Hummingbot API publishes to
 *      loopback / an internal network) plus mTLS and the API token — NOT an in-container
 *      loopback bind, which would make Gateway unreachable and is what §4 originally regressed.
 *   3. 127.0.0.1 on bare metal — the §4 loopback-by-default control for a host `pnpm start`.
 */
export function getBindAddress(inContainer: boolean = isRunningInContainer()): string {
  const fromEnv = process.env.GATEWAY_BIND_ADDRESS?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return inContainer ? '0.0.0.0' : '127.0.0.1';
}

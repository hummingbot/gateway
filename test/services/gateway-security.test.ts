import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import {
  clearAuthFailures,
  constantTimeEqual,
  extractBearerToken,
  getBindAddress,
  isAuthLockedOut,
  isExposedHost,
  isLoopbackAddress,
  isPrivateNetworkAddress,
  isSensitivePath,
  isTrustedLocalAddress,
  isWeakApiKey,
  loadOrCreateApiKey,
  recordAuthFailure,
} from '../../src/services/gateway-security';

describe('gateway-security', () => {
  afterEach(() => {
    delete process.env.GATEWAY_API_KEY;
    delete process.env.GATEWAY_BIND_ADDRESS;
  });

  describe('isLoopbackAddress', () => {
    it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost', '127.0.0.2'])('true for %s', (ip) => {
      expect(isLoopbackAddress(ip)).toBe(true);
    });
    it.each(['0.0.0.0', '192.168.1.5', '10.0.0.3', '8.8.8.8', undefined])('false for %s', (ip) => {
      expect(isLoopbackAddress(ip as any)).toBe(false);
    });
  });

  it('isExposedHost is the inverse of loopback', () => {
    expect(isExposedHost('127.0.0.1')).toBe(false);
    expect(isExposedHost('::1')).toBe(false);
    expect(isExposedHost('0.0.0.0')).toBe(true);
    expect(isExposedHost('192.168.1.5')).toBe(true);
  });

  describe('isPrivateNetworkAddress', () => {
    it.each([
      '10.0.0.3',
      '10.255.255.255',
      '172.16.0.1',
      '172.18.0.2', // typical docker-compose bridge
      '172.31.255.254',
      '192.168.1.5',
      '::ffff:172.18.0.2', // IPv4-mapped IPv6 (Node/Fastify form)
      'fd00::1', // IPv6 unique-local (docker IPv6 bridge)
      'fc00::abcd',
    ])('true for %s', (ip) => {
      expect(isPrivateNetworkAddress(ip)).toBe(true);
    });
    it.each([
      '8.8.8.8',
      '1.1.1.1',
      '172.15.0.1', // just below the /12
      '172.32.0.1', // just above the /12
      '193.168.1.1', // not 192.168
      '11.0.0.0', // not 10/8
      '127.0.0.1', // loopback is not "private-network" here
      'fe80::1', // link-local, deliberately excluded
      '2001:4860:4860::8888', // public IPv6
      undefined,
    ])('false for %s', (ip) => {
      expect(isPrivateNetworkAddress(ip as any)).toBe(false);
    });
  });

  describe('isTrustedLocalAddress (rate-limit allowlist)', () => {
    it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.0.0.5', '172.18.0.2', '192.168.0.9', 'fd00::2'])(
      'true for %s (loopback or private/bridge)',
      (ip) => {
        expect(isTrustedLocalAddress(ip)).toBe(true);
      },
    );
    it.each(['8.8.8.8', '203.0.113.7', '2001:4860:4860::8888', undefined])('false for public %s', (ip) => {
      expect(isTrustedLocalAddress(ip as any)).toBe(false);
    });
  });

  describe('isSensitivePath', () => {
    it.each([
      '/wallet',
      '/wallet/add',
      '/wallet/add-swig',
      '/restart',
      // Router surface: both fund-moving verbs.
      '/trading/router/execute-swap',
      '/trading/router/execute-quote',
      // Pool-scoped surfaces: swaps and every liquidity mutation. The AMM entries
      // matter most — they were previously gated only through /connectors/*, which
      // no longer exists, so a gap here would silently expose them.
      '/trading/clmm/execute-swap',
      '/trading/clmm/open',
      '/trading/clmm/add',
      '/trading/clmm/remove',
      '/trading/clmm/collect-fees',
      '/trading/clmm/close',
      '/trading/clmm/create-pool',
      '/trading/amm/execute-swap',
      '/trading/amm/open',
      '/trading/amm/add',
      '/trading/amm/remove',
      '/trading/amm/close',
      '/trading/amm/create-pool',
      // Chain routes that sign. `approve` is the one that was missing: reachable
      // unauthenticated, it makes the hot wallet approve an unlimited allowance to an
      // address the caller chooses, and transferFrom does the rest.
      '/chains/ethereum/approve',
      '/chains/ethereum/wrap',
      '/chains/solana/unwrap',
      '/chains/ethereum/APPROVE',
    ])('sensitive: %s', (url) => {
      expect(isSensitivePath(url)).toBe(true);
    });
    it.each([
      '/docs',
      '/config/namespaces',
      '/chains/solana/status',
      '/chains/ethereum/allowances',
      '/chains/ethereum/balances',
      '/chains/ethereum/estimate-gas',
      '/chains/solana/poll',
      // Not a chain route at all; the pattern must not reach past the chain segment.
      '/tokens/chains/ethereum/approve',
      '/trading/router/quote-swap',
      '/trading/clmm/quote-swap',
      '/trading/amm/quote-swap',
      '/trading/clmm/pool-info',
      '/trading/clmm/position-info',
      '/trading/clmm/positions-owned',
      '/trading/clmm/quote-liquidity',
      '/trading/clmm/fetch-pools',
      '/trading/amm/pool-info',
      '/trading/amm/quote-liquidity',
    ])('not sensitive: %s', (url) => {
      expect(isSensitivePath(url)).toBe(false);
    });
  });

  describe('constantTimeEqual', () => {
    it('true for equal strings', () => expect(constantTimeEqual('s3cret', 's3cret')).toBe(true));
    it('false for different strings', () => expect(constantTimeEqual('s3cret', 's3creT')).toBe(false));
    it('false for different lengths', () => expect(constantTimeEqual('a', 'aaaa')).toBe(false));
  });

  describe('extractBearerToken', () => {
    it('parses a bearer token', () => expect(extractBearerToken('Bearer abc123')).toBe('abc123'));
    it('empty for non-bearer / missing', () => {
      expect(extractBearerToken('Basic abc')).toBe('');
      expect(extractBearerToken(undefined)).toBe('');
    });
  });

  describe('getBindAddress', () => {
    it('defaults to loopback on bare metal', () => expect(getBindAddress(false)).toBe('127.0.0.1'));
    it('defaults to all-interfaces inside a container', () => expect(getBindAddress(true)).toBe('0.0.0.0'));
    it('honors GATEWAY_BIND_ADDRESS', () => {
      process.env.GATEWAY_BIND_ADDRESS = '0.0.0.0';
      expect(getBindAddress(false)).toBe('0.0.0.0');
    });
    it('lets GATEWAY_BIND_ADDRESS pin loopback even inside a container', () => {
      process.env.GATEWAY_BIND_ADDRESS = '127.0.0.1';
      expect(getBindAddress(true)).toBe('127.0.0.1');
    });
  });

  describe('loadOrCreateApiKey', () => {
    it('prefers the env var', () => {
      process.env.GATEWAY_API_KEY = 'env-token';
      expect(loadOrCreateApiKey('/nonexistent')).toBe('env-token');
    });
    it('generates and persists a 0600 key file', () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'gw-apikey-'));
      try {
        const key = loadOrCreateApiKey(dir);
        expect(key).toMatch(/^[0-9a-f]{64}$/); // 256-bit hex
        const keyPath = path.join(dir, 'api-key');
        expect(existsSync(keyPath)).toBe(true);
        expect(readFileSync(keyPath, 'utf8').trim()).toBe(key);
        // 0600 perms (owner rw only)
        expect(statSync(keyPath).mode & 0o777).toBe(0o600);
        // stable across calls
        expect(loadOrCreateApiKey(dir)).toBe(key);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('isWeakApiKey', () => {
    it.each(['', 'short', 'a'.repeat(15)])('true for weak key %p', (k) => {
      expect(isWeakApiKey(k)).toBe(true);
    });
    it.each(['a'.repeat(16), 'b'.repeat(64)])('false for strong-length key %p', (k) => {
      expect(isWeakApiKey(k)).toBe(false);
    });
  });

  describe('failed-auth lockout', () => {
    afterEach(() => clearAuthFailures());

    it('does not lock out below the threshold', () => {
      const ip = '172.18.0.9';
      for (let i = 0; i < 9; i++) recordAuthFailure(ip);
      expect(isAuthLockedOut(ip)).toBe(false);
    });

    it('locks out at the threshold and is keyed per source', () => {
      const attacker = '172.18.0.9';
      for (let i = 0; i < 10; i++) recordAuthFailure(attacker);
      expect(isAuthLockedOut(attacker)).toBe(true);
      expect(isAuthLockedOut('172.18.0.10')).toBe(false); // a different source is unaffected
    });

    it('a successful auth clears the counter', () => {
      const ip = '10.0.0.5';
      for (let i = 0; i < 10; i++) recordAuthFailure(ip);
      expect(isAuthLockedOut(ip)).toBe(true);
      clearAuthFailures(ip);
      expect(isAuthLockedOut(ip)).toBe(false);
    });

    it('the lockout window expires', () => {
      const ip = '192.168.1.7';
      const t0 = 1_000_000;
      for (let i = 0; i < 10; i++) recordAuthFailure(ip, t0);
      expect(isAuthLockedOut(ip, t0)).toBe(true);
      expect(isAuthLockedOut(ip, t0 + 16 * 60 * 1000)).toBe(false); // past the default 15-min window
    });
  });
});

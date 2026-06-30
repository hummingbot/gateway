import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import {
  constantTimeEqual,
  extractBearerToken,
  getBindAddress,
  isExposedHost,
  isLoopbackAddress,
  isSensitivePath,
  loadOrCreateApiKey,
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

  describe('isSensitivePath', () => {
    it.each([
      '/wallet',
      '/wallet/add',
      '/wallet/add-swig',
      '/connectors/orca/clmm/execute-swap',
      '/connectors/jupiter/router/execute-quote',
    ])('sensitive: %s', (url) => {
      expect(isSensitivePath(url)).toBe(true);
    });
    it.each(['/docs', '/config/namespaces', '/chains/solana/status', '/connectors/orca/clmm/quote-swap'])(
      'not sensitive: %s',
      (url) => {
        expect(isSensitivePath(url)).toBe(false);
      },
    );
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
    it('defaults to loopback', () => expect(getBindAddress()).toBe('127.0.0.1'));
    it('honors GATEWAY_BIND_ADDRESS', () => {
      process.env.GATEWAY_BIND_ADDRESS = '0.0.0.0';
      expect(getBindAddress()).toBe('0.0.0.0');
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
});

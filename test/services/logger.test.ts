import winston from 'winston';

// Import shared mock components but don't setup all mocks
import { mockConfigStorage, mockConfigManagerV2 } from '../mocks/shared-mocks';

// Only mock ConfigManagerV2, not logger
jest.mock('../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: mockConfigManagerV2,
}));

import { ConfigManagerV2 } from '../../src/services/config-manager-v2';
import { logger, redactUrl, updateLoggerToStdout } from '../../src/services/logger';

describe('Test logger', () => {
  it('updateLoggerToStdout adds the stdout transport when enabled and removes it when disabled', () => {
    const consoleTransports = () =>
      logger.transports.filter((transport) => transport instanceof winston.transports.Console).length;

    ConfigManagerV2.getInstance().set('server.logToStdOut', false);
    updateLoggerToStdout();
    const withoutStdout = consoleTransports();

    ConfigManagerV2.getInstance().set('server.logToStdOut', true);
    updateLoggerToStdout();
    expect(consoleTransports()).toBe(withoutStdout + 1);

    ConfigManagerV2.getInstance().set('server.logToStdOut', false);
    updateLoggerToStdout();
    expect(consoleTransports()).toBe(withoutStdout);
  });
});

describe('redactUrl', () => {
  it('redacts ?api-key= query parameter (Helius)', () => {
    expect(redactUrl('https://mainnet.helius-rpc.com/?api-key=abc123def')).toBe(
      'https://mainnet.helius-rpc.com/?api-key=***',
    );
  });

  it('redacts /v3/<key> Infura path token', () => {
    expect(redactUrl('https://mainnet.infura.io/v3/0123456789abcdef0123456789abcdef')).toBe(
      'https://mainnet.infura.io/v3/***',
    );
  });

  it('redacts Chainstack core.chainstack.com path token', () => {
    expect(redactUrl('https://solana-mainnet.core.chainstack.com/672db840c708fd8caf6d9e002f026739')).toBe(
      'https://solana-mainnet.core.chainstack.com/***',
    );
  });

  it('redacts Chainstack p2pify.com path token', () => {
    expect(redactUrl('https://nd-123-456-789.p2pify.com/abcdef0123456789')).toBe(
      'https://nd-123-456-789.p2pify.com/***',
    );
  });

  it('preserves URLs that do not contain known credential formats', () => {
    expect(redactUrl('https://api.mainnet-beta.solana.com')).toBe('https://api.mainnet-beta.solana.com');
  });

  it('returns empty string and undefined-like inputs unchanged', () => {
    expect(redactUrl('')).toBe('');
  });
});

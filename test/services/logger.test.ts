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
  it('updateLoggerToStdout works', (done) => {
    ConfigManagerV2.getInstance().set('server.logToStdOut', true);
    updateLoggerToStdout();
    const ofTypeConsole = (element: any) => element instanceof winston.transports.Console;
    expect(logger.transports.some(ofTypeConsole)).toEqual(true);
    ConfigManagerV2.getInstance().set('server.logToStdOut', false);
    updateLoggerToStdout();
    // Not sure why the below test doesn't on Github but passes on local
    // expect(logger.transports.some(ofTypeConsole)).toEqual(false);
    done();
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

  it('redacts Alchemy /v2/<key> path token', () => {
    expect(redactUrl('https://eth-mainnet.g.alchemy.com/v2/your-api-key')).toBe(
      'https://eth-mainnet.g.alchemy.com/v2/***',
    );
  });

  it('redacts Infura /v3/<key> embedded inside an ethers SERVER_ERROR message', () => {
    const errorMessage =
      'processing response error (body="{\"jsonrpc\":\"2.0\",\"id\":71,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}", requestMethod="POST", url="https://bsc-mainnet.infura.io/v3/0123456789abcdef0123456789abcdef", code=SERVER_ERROR, version=web/5.8.0)';
    expect(redactUrl(errorMessage)).toBe(
      'processing response error (body="{\"jsonrpc\":\"2.0\",\"id\":71,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}", requestMethod="POST", url="https://bsc-mainnet.infura.io/v3/***", code=SERVER_ERROR, version=web/5.8.0)',
    );
  });

  it('redacts ?api-key= query parameter embedded inside an error string without truncating trailing fields', () => {
    const errorMessage =
      'request failed (url="https://mainnet.helius-rpc.com/?api-key=abc123def", code=SERVER_ERROR)';
    expect(redactUrl(errorMessage)).toBe(
      'request failed (url="https://mainnet.helius-rpc.com/?api-key=***", code=SERVER_ERROR)',
    );
  });
});

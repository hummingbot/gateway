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
  it.each([
    ['Helius query key', 'https://mainnet.helius-rpc.com/?api-key=abc123def', 'https://mainnet.helius-rpc.com'],
    ['Infura path key', 'https://mainnet.infura.io/v3/0123456789abcdef0123456789abcdef', 'https://mainnet.infura.io'],
    ['Alchemy path key', 'https://eth-mainnet.g.alchemy.com/v2/your-api-key', 'https://eth-mainnet.g.alchemy.com'],
    [
      'Chainstack path token',
      'https://solana-mainnet.core.chainstack.com/672db840c708fd8caf6d9e002f026739',
      'https://solana-mainnet.core.chainstack.com',
    ],
    [
      'QuickNode path token',
      'https://some-name.solana-mainnet.quiknode.pro/0123456789abcdef0123456789abcdef01234567/',
      'https://some-name.solana-mainnet.quiknode.pro',
    ],
    ['Ankr path key', 'https://rpc.ankr.com/eth/0123456789abcdef', 'https://rpc.ankr.com'],
    ['dRPC query key', 'https://lb.drpc.org/ogrpc?network=ethereum&dkey=SECRET', 'https://lb.drpc.org'],
    ['GetBlock path key', 'https://go.getblock.io/0123456789abcdef', 'https://go.getblock.io'],
    ['a ?token= key', 'https://rpc.example.com/?token=SECRET', 'https://rpc.example.com'],
    ['userinfo credentials', 'https://user:secret@rpc.example.com/path', 'https://rpc.example.com'],
    ['a websocket endpoint', 'wss://mainnet.helius-rpc.com/?api-key=abc123def', 'wss://mainnet.helius-rpc.com'],
    ['a port', 'http://localhost:8899/SECRET', 'http://localhost:8899'],
  ])('cuts a URL with %s down to scheme and host', (_what, url, expected) => {
    expect(redactUrl(url)).toBe(expected);
  });

  it('leaves a URL that is only scheme and host unchanged', () => {
    expect(redactUrl('https://api.mainnet-beta.solana.com')).toBe('https://api.mainnet-beta.solana.com');
  });

  it('returns an empty string unchanged', () => {
    expect(redactUrl('')).toBe('');
  });

  it('cuts a URL inside an error message without touching the fields around it', () => {
    const errorMessage =
      'processing response error (body="{\"jsonrpc\":\"2.0\",\"id\":71,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}", requestMethod="POST", url="https://bsc-mainnet.infura.io/v3/0123456789abcdef0123456789abcdef", code=SERVER_ERROR, version=web/5.8.0)';
    expect(redactUrl(errorMessage)).toBe(
      'processing response error (body="{\"jsonrpc\":\"2.0\",\"id\":71,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}", requestMethod="POST", url="https://bsc-mainnet.infura.io", code=SERVER_ERROR, version=web/5.8.0)',
    );
  });

  it('cuts every URL in a line of text', () => {
    expect(redactUrl('tried https://a.example.com/k1 then https://b.example.com/?key=k2 and gave up')).toBe(
      'tried https://a.example.com then https://b.example.com and gave up',
    );
  });
});

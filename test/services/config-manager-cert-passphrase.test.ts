// Only mock the dependencies that ConfigManagerCertPassphrase needs
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import shared mock for ConfigManagerV2 only
import { mockConfigManagerV2 } from '../mocks/shared-mocks';

jest.mock('../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: mockConfigManagerV2,
}));

import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';

import { patch, unpatch } from './patch';
import 'jest-extended';

describe('ConfigManagerCertPassphrase.readPassphrase', () => {
  let witnessFailure = false;

  afterEach(() => {
    unpatch();
    witnessFailure = false;
  });

  beforeEach(() => {
    patch(ConfigManagerCertPassphrase.bindings, '_exit', () => {
      witnessFailure = true;
    });
  });

  it('should get an error if there is no cert phrase', async () => {
    // Clear any existing passphrase from environment variables
    const originalPassphrase = process.env['GATEWAY_PASSPHRASE'];
    delete process.env['GATEWAY_PASSPHRASE'];

    ConfigManagerCertPassphrase.readPassphrase();
    expect(witnessFailure).toEqual(true);

    // Restore the original passphrase if it existed
    if (originalPassphrase !== undefined) {
      process.env['GATEWAY_PASSPHRASE'] = originalPassphrase;
    }
  });

  it('should get the cert phrase from the process args', async () => {
    const passphrase = 'args_passphrase';
    process.argv.push(`--passphrase=${passphrase}`);
    const certPhrase = ConfigManagerCertPassphrase.readPassphrase();
    expect(certPhrase).toEqual(passphrase);
    process.argv.pop();
  });

  it('should get the cert phrase from an env variable', async () => {
    const passphrase = 'env_var_passphrase';
    process.env['GATEWAY_PASSPHRASE'] = passphrase;
    const certPhrase = ConfigManagerCertPassphrase.readPassphrase();
    expect(certPhrase).toEqual(passphrase);
    delete process.env['GATEWAY_PASSPHRASE'];
  });

  it('should accept numeric cert phrase', async () => {
    const passphrase = '12345';
    process.env['GATEWAY_PASSPHRASE'] = passphrase;
    const certPhrase = ConfigManagerCertPassphrase.readPassphrase();
    expect(certPhrase).toEqual(passphrase);
    delete process.env['GATEWAY_PASSPHRASE'];
  });
});

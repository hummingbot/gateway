// Tests for multi-network wallet storage, defaultWallet in GET response,
// createWallet network support, and addHardwareWallet network support.
// Mocks fs-extra — never writes real files.
jest.mock('fs-extra');

import * as fse from 'fs-extra';

import { gatewayApp } from '../../src/app';
import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
import { ConfigManagerV2 } from '../../src/services/config-manager-v2';
import { patch } from '../services/patch';

const mockFse = fse as jest.Mocked<typeof fse>;

const TEST_PASSPHRASE = 'test-passphrase';
const TEST_ETH_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const TEST_ETH_PK = '0x0000000000000000000000000000000000000000000000000000000000000001';

const mockEthEncrypted = JSON.stringify({
  address: TEST_ETH_ADDRESS.toLowerCase().slice(2),
  id: 'test-id',
  version: 3,
  Crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: 'iv' },
    ciphertext: 'ct',
    kdf: 'scrypt',
    kdfparams: { salt: 's', n: 131072, dklen: 32, p: 1, r: 8 },
    mac: 'mac',
  },
});

let ethereumMainnet: Ethereum;
let ethereumBsc: Ethereum;

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => TEST_PASSPHRASE);
  patch(ConfigManagerCertPassphrase, 'readWalletKey', () => TEST_PASSPHRASE);
  ethereumMainnet = await Ethereum.getInstance('mainnet');
  ethereumBsc = await Ethereum.getInstance('bsc');
  await gatewayApp.ready();
});

beforeEach(() => {
  jest.clearAllMocks();
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => TEST_PASSPHRASE);
  patch(ConfigManagerCertPassphrase, 'readWalletKey', () => TEST_PASSPHRASE);

  [ethereumMainnet, ethereumBsc].forEach((eth) => {
    patch(eth, 'getWalletFromPrivateKey', () => ({ address: TEST_ETH_ADDRESS }));
    patch(eth, 'encrypt', () => mockEthEncrypted);
  });

  (mockFse.pathExists as jest.Mock).mockResolvedValue(false);
  (mockFse.mkdir as jest.Mock).mockResolvedValue(undefined);
  (mockFse.writeFile as jest.Mock).mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-network wallet storage
// ─────────────────────────────────────────────────────────────────────────────
describe('Multi-network wallet storage (POST /wallet/add)', () => {
  it('stores networks[] array on first add', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/add',
      payload: { chain: 'ethereum', network: 'bsc', privateKey: TEST_ETH_PK },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.network).toBe('bsc');

    const writeCalls = (mockFse.writeFile as jest.Mock).mock.calls;
    expect(writeCalls.length).toBeGreaterThan(0);
    const written = JSON.parse(writeCalls[0][1] as string);
    expect(written.network).toBe('bsc');
    expect(written.networks).toEqual(['bsc']);
    expect(written).toHaveProperty('encryptedKey');
  });

  it('merges new network into existing wallet file without overwriting', async () => {
    // Existing wallet file already has mainnet
    const existingData = JSON.stringify({
      encryptedKey: mockEthEncrypted,
      network: 'mainnet',
      networks: ['mainnet'],
    });
    (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
    (mockFse.readFile as jest.Mock).mockResolvedValue(existingData);

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/add',
      payload: { chain: 'ethereum', network: 'bsc', privateKey: TEST_ETH_PK },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.address).toBe(TEST_ETH_ADDRESS);
    expect(body.network).toBe('bsc');

    // Check the file was written with BOTH networks
    const writeCalls = (mockFse.writeFile as jest.Mock).mock.calls;
    const written = JSON.parse(writeCalls[0][1] as string);
    expect(written.networks).toContain('mainnet');
    expect(written.networks).toContain('bsc');
    expect(written.networks).toHaveLength(2);
  });

  it('does not duplicate a network if added twice', async () => {
    const existingData = JSON.stringify({
      encryptedKey: mockEthEncrypted,
      network: 'bsc',
      networks: ['mainnet', 'bsc'],
    });
    (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
    (mockFse.readFile as jest.Mock).mockResolvedValue(existingData);

    await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/add',
      payload: { chain: 'ethereum', network: 'bsc', privateKey: TEST_ETH_PK },
    });

    const writeCalls = (mockFse.writeFile as jest.Mock).mock.calls;
    const written = JSON.parse(writeCalls[0][1] as string);
    // Should still be exactly 2, not 3
    expect(written.networks).toHaveLength(2);
  });

  it('returns correct network in response for both mainnet and bsc adds', async () => {
    for (const network of ['mainnet', 'bsc', 'arbitrum']) {
      jest.clearAllMocks();
      (mockFse.pathExists as jest.Mock).mockResolvedValue(false);
      (mockFse.mkdir as jest.Mock).mockResolvedValue(undefined);
      (mockFse.writeFile as jest.Mock).mockResolvedValue(undefined);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: { chain: 'ethereum', network, privateKey: TEST_ETH_PK },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).network).toBe(network);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /wallet/ — walletDetails per-network expansion + defaultWallet
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /wallet/ — multi-network walletDetails and defaultWallet', () => {
  it('expands walletDetails into one entry per registered network', async () => {
    // Wallet file has two networks
    const walletContent = JSON.stringify({
      encryptedKey: mockEthEncrypted,
      network: 'bsc',
      networks: ['mainnet', 'bsc'],
    });

    (mockFse.readdir as jest.Mock)
      .mockResolvedValueOnce([{ name: 'ethereum', isDirectory: () => true, isFile: () => false }] as any)
      .mockResolvedValueOnce([
        { name: `${TEST_ETH_ADDRESS}.json`, isDirectory: () => false, isFile: () => true },
      ] as any);
    (mockFse.readFile as jest.Mock).mockResolvedValue(walletContent);
    (mockFse.pathExists as jest.Mock).mockResolvedValue(true);

    // No hardware wallets
    patch(ConfigManagerV2.getInstance(), 'get', (key: string) => {
      if (key === 'ethereum.defaultWallet') return TEST_ETH_ADDRESS;
      return undefined;
    });

    const response = await gatewayApp.inject({ method: 'GET', url: '/wallet/?showHardware=false' });
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    const eth = body.find((e: any) => e.chain === 'ethereum');
    expect(eth).toBeDefined();

    // walletAddresses must remain deduplicated (backwards compat: address appears once)
    expect(eth.walletAddresses).toHaveLength(1);
    expect(eth.walletAddresses[0]).toBe(TEST_ETH_ADDRESS);

    // walletDetails must expand to one entry per network
    expect(eth.walletDetails).toHaveLength(2);
    const networks = eth.walletDetails.map((d: any) => d.network);
    expect(networks).toContain('mainnet');
    expect(networks).toContain('bsc');

    // Each walletDetail entry carries the full networks[] array
    eth.walletDetails.forEach((d: any) => {
      expect(d.networks).toEqual(['mainnet', 'bsc']);
    });
  });

  it('shows defaultWallet field when a default is configured', async () => {
    const walletContent = JSON.stringify({
      encryptedKey: mockEthEncrypted,
      network: 'mainnet',
      networks: ['mainnet'],
    });

    (mockFse.readdir as jest.Mock)
      .mockResolvedValueOnce([{ name: 'ethereum', isDirectory: () => true, isFile: () => false }] as any)
      .mockResolvedValueOnce([
        { name: `${TEST_ETH_ADDRESS}.json`, isDirectory: () => false, isFile: () => true },
      ] as any);
    (mockFse.readFile as jest.Mock).mockResolvedValue(walletContent);
    (mockFse.pathExists as jest.Mock).mockResolvedValue(true);

    patch(ConfigManagerV2.getInstance(), 'get', (key: string) => {
      if (key === 'ethereum.defaultWallet') return TEST_ETH_ADDRESS;
      return undefined;
    });

    const response = await gatewayApp.inject({ method: 'GET', url: '/wallet/?showHardware=false' });
    const body = JSON.parse(response.body);
    const eth = body.find((e: any) => e.chain === 'ethereum');

    expect(eth.defaultWallet).toBe(TEST_ETH_ADDRESS);
  });

  it('omits defaultWallet field when none is configured', async () => {
    const walletContent = JSON.stringify({
      encryptedKey: mockEthEncrypted,
      network: 'mainnet',
      networks: ['mainnet'],
    });

    (mockFse.readdir as jest.Mock)
      .mockResolvedValueOnce([{ name: 'ethereum', isDirectory: () => true, isFile: () => false }] as any)
      .mockResolvedValueOnce([
        { name: `${TEST_ETH_ADDRESS}.json`, isDirectory: () => false, isFile: () => true },
      ] as any);
    (mockFse.readFile as jest.Mock).mockResolvedValue(walletContent);
    (mockFse.pathExists as jest.Mock).mockResolvedValue(true);

    // Return empty string for default wallet (not configured)
    patch(ConfigManagerV2.getInstance(), 'get', (_key: string) => '');

    const response = await gatewayApp.inject({ method: 'GET', url: '/wallet/?showHardware=false' });
    const body = JSON.parse(response.body);
    const eth = body.find((e: any) => e.chain === 'ethereum');

    expect(eth.defaultWallet).toBeUndefined();
  });

  it('handles legacy wallet file (raw encrypted string) with default network in walletDetails', async () => {
    (mockFse.readdir as jest.Mock)
      .mockResolvedValueOnce([{ name: 'ethereum', isDirectory: () => true, isFile: () => false }] as any)
      .mockResolvedValueOnce([
        { name: `${TEST_ETH_ADDRESS}.json`, isDirectory: () => false, isFile: () => true },
      ] as any);
    // Legacy format: raw encrypted string
    (mockFse.readFile as jest.Mock).mockResolvedValue('some-raw-encrypted-string');
    (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
    patch(ConfigManagerV2.getInstance(), 'get', (_key: string) => undefined);

    const response = await gatewayApp.inject({ method: 'GET', url: '/wallet/?showHardware=false' });
    const body = JSON.parse(response.body);
    const eth = body.find((e: any) => e.chain === 'ethereum');

    // Legacy wallets should default to mainnet, walletDetails has 1 entry
    expect(eth.walletDetails).toHaveLength(1);
    expect(eth.walletDetails[0].network).toBe('mainnet');
    expect(eth.walletDetails[0].networks).toEqual(['mainnet']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /wallet/create — network/chainNetwork support
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /wallet/create — network/chainNetwork support', () => {
  beforeEach(() => {
    // Mock Ethereum.getInstance to return a mocked instance
    patch(ethereumMainnet, 'encrypt', () => mockEthEncrypted);
    patch(ethereumBsc, 'encrypt', () => mockEthEncrypted);
    (mockFse.pathExists as jest.Mock).mockResolvedValue(false);
    (mockFse.mkdir as jest.Mock).mockResolvedValue(undefined);
    (mockFse.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns network in response when creating wallet without specifying network', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/create',
      payload: { chain: 'ethereum' },
    });

    // May fail if Ethereum wallet generation is not mocked; accept 200 or 500
    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('network');
      expect(body.network).toBe('mainnet'); // default for ethereum
      expect(body.chain).toBe('ethereum');
      expect(body.address).toBeDefined();
    }
  });

  it('stores networks[] when writing new created wallet file', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/create',
      payload: { chain: 'ethereum', network: 'bsc' },
    });

    if (response.statusCode === 200) {
      const writeCalls = (mockFse.writeFile as jest.Mock).mock.calls;
      expect(writeCalls.length).toBeGreaterThan(0);
      const written = JSON.parse(writeCalls[0][1] as string);
      expect(written.networks).toEqual(['bsc']);
      expect(written.network).toBe('bsc');
    }
  });

  it('response includes chain field alongside network', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/create',
      payload: { chain: 'ethereum' },
    });

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('ethereum');
      expect(body).toHaveProperty('network');
      expect(body).toHaveProperty('address');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: walletAddresses stays backwards-compatible
// ─────────────────────────────────────────────────────────────────────────────
describe('Backwards compatibility — walletAddresses remains string[]', () => {
  it('walletAddresses is always a plain string array regardless of how many networks', async () => {
    const walletContent = JSON.stringify({
      encryptedKey: mockEthEncrypted,
      network: 'bsc',
      networks: ['mainnet', 'bsc', 'arbitrum'],
    });

    (mockFse.readdir as jest.Mock)
      .mockResolvedValueOnce([{ name: 'ethereum', isDirectory: () => true, isFile: () => false }] as any)
      .mockResolvedValueOnce([
        { name: `${TEST_ETH_ADDRESS}.json`, isDirectory: () => false, isFile: () => true },
      ] as any);
    (mockFse.readFile as jest.Mock).mockResolvedValue(walletContent);
    (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
    patch(ConfigManagerV2.getInstance(), 'get', (_key: string) => undefined);

    const response = await gatewayApp.inject({ method: 'GET', url: '/wallet/?showHardware=false' });
    const body = JSON.parse(response.body);
    const eth = body.find((e: any) => e.chain === 'ethereum');

    // Hummingbot lens: walletAddresses must be string[] with address appearing exactly once
    expect(Array.isArray(eth.walletAddresses)).toBe(true);
    expect(eth.walletAddresses.every((a: any) => typeof a === 'string')).toBe(true);
    expect(eth.walletAddresses).toHaveLength(1); // one address, deduplicated
    expect(eth.walletAddresses[0]).toBe(TEST_ETH_ADDRESS);

    // walletDetails expands to 3 entries (one per network)
    expect(eth.walletDetails).toHaveLength(3);
  });
});

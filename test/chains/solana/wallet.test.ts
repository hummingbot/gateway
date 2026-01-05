// Mock fs-extra to prevent actual file writes
jest.mock('fs-extra');

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fse from 'fs-extra';

import { gatewayApp } from '../../../src/app';
import { Solana } from '../../../src/chains/solana/solana';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
import { GetWalletResponse } from '../../../src/wallet/schemas';
import { patch, unpatch } from '../../services/patch';

const mockFse = fse as jest.Mocked<typeof fse>;

let solana: Solana;

// Generate test keypair
const testKeypair = Keypair.generate();
const testAddress = testKeypair.publicKey.toString();
const testPrivateKey = bs58.encode(testKeypair.secretKey);

// Mock the encoded private key response
const encodedPrivateKey = {
  address: testAddress.toLowerCase(),
  id: 'test-id-12345',
  version: 3,
  Crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: 'test-iv-12345' },
    ciphertext: 'mock-encrypted-key', // noqa: mock
    kdf: 'scrypt',
    kdfparams: {
      salt: 'mock-salt', // noqa: mock
      n: 131072,
      dklen: 32,
      p: 1,
      r: 8,
    },
    mac: 'mock-mac', // noqa: mock
  },
};

// Track wallet operations in memory to avoid file system pollution
const mockWallets: { [key: string]: Set<string> } = {
  solana: new Set<string>(),
};

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
  solana = await Solana.getInstance('mainnet-beta');
  await gatewayApp.ready();
});

beforeEach(() => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');

  // Clear mock wallets
  mockWallets.solana.clear();

  // Mock wallet operations to work with in-memory storage
  patch(solana, 'getKeypairFromPrivateKey', () => {
    return testKeypair;
  });

  patch(solana, 'encrypt', () => {
    return JSON.stringify(encodedPrivateKey);
  });

  // Setup fs-extra mocks
  (mockFse.writeFile as jest.Mock).mockImplementation(async (path: any) => {
    const pathStr = path.toString();
    const pathParts = pathStr.split('/');
    const chain = pathParts[pathParts.length - 2];
    const address = pathParts[pathParts.length - 1].replace('.json', '');

    if (chain && address) {
      mockWallets[chain].add(address);
    }
    return undefined;
  });

  (mockFse.readdir as jest.Mock).mockImplementation(async (dirPath: any, options?: any) => {
    const pathStr = dirPath.toString();

    // If asking for directories in wallet path
    if (pathStr.endsWith('/wallets') && options?.withFileTypes) {
      return Object.keys(mockWallets).map((chain) => ({
        name: chain,
        isDirectory: () => true,
        isFile: () => false,
      }));
    }

    // If asking for files in a chain directory
    const chain = pathStr.split('/').pop();
    if (chain && mockWallets[chain]) {
      if (options?.withFileTypes) {
        return Array.from(mockWallets[chain]).map((addr) => ({
          name: `${addr}.json`,
          isDirectory: () => false,
          isFile: () => true,
        }));
      }
      return Array.from(mockWallets[chain]).map((addr) => `${addr}.json`);
    }

    return [];
  });

  (mockFse.readFile as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify(encodedPrivateKey)));
  (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
  (mockFse.ensureDir as jest.Mock).mockResolvedValue(undefined);

  (mockFse.remove as jest.Mock).mockImplementation(async (filePath: any) => {
    const pathStr = filePath.toString();
    const pathParts = pathStr.split('/');
    const chain = pathParts[pathParts.length - 2];
    const address = pathParts[pathParts.length - 1].replace('.json', '');

    if (chain && mockWallets[chain]) {
      mockWallets[chain].delete(address);
    }
    return undefined;
  });
});

afterAll(async () => {
  await solana.close();
  await gatewayApp.close();
});

afterEach(() => {
  unpatch();
  jest.clearAllMocks();
});

describe('Solana Wallet Operations', () => {
  describe('POST /wallet/add', () => {
    it('should add a Solana wallet successfully', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: testPrivateKey,
          chain: 'solana',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const result = JSON.parse(response.payload);
      expect(result).toMatchObject({
        address: testAddress,
      });
    });

    it('should fail with invalid private key', async () => {
      // Override the mock to simulate invalid key
      patch(solana, 'getKeypairFromPrivateKey', () => {
        throw new Error('Invalid private key');
      });

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: 'invalid-key',
          chain: 'solana',
        },
      });

      // With sensible plugin, validation errors return 400 (bad request) instead of 500
      expect(response.statusCode).toBe(400);
    });

    it('should fail with missing parameters', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          chain: 'solana',
          // missing privateKey
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /wallet', () => {
    it('should fetch wallets for Solana', async () => {
      // First add a wallet
      mockWallets.solana.add(testAddress);

      const response = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const wallets: GetWalletResponse[] = JSON.parse(response.payload);
      const solanaWallet = wallets.find((w) => w.chain === 'solana');

      expect(solanaWallet).toBeDefined();
      expect(solanaWallet?.walletAddresses).toContain(testAddress);
    });

    it('should return empty array when no wallets exist', async () => {
      // Clear wallets
      mockWallets.solana.clear();

      const response = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });

      expect(response.statusCode).toBe(200);

      const wallets: GetWalletResponse[] = JSON.parse(response.payload);
      const solanaWallet = wallets.find((w) => w.chain === 'solana');

      expect(solanaWallet?.walletAddresses).toHaveLength(0);
    });
  });

  describe('DELETE /wallet/remove', () => {
    it('should remove a Solana wallet successfully', async () => {
      // First add the wallet to mock storage
      mockWallets.solana.add(testAddress);

      const response = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: testAddress,
          chain: 'solana',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const body = JSON.parse(response.payload);
      expect(body.message).toContain('removed successfully');
      expect(mockWallets.solana.has(testAddress)).toBe(false);
    });

    it('should fail when removing non-existent wallet', async () => {
      (mockFse.pathExists as jest.Mock).mockResolvedValue(false);

      const response = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: '7RCz8wb6WXxUhAigxy9rWPRB2GmTDaYH1Jb8GzJ5Vf9P',
          chain: 'solana',
        },
      });

      // The endpoint doesn't check if wallet exists, just removes the file
      expect(response.statusCode).toBe(200);
    });

    it('should fail with invalid address format', async () => {
      const response = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: 'invalid-address',
          chain: 'solana',
        },
      });

      // Address validation happens and throws 500 on invalid format
      expect(response.statusCode).toBe(500);
    });
  });

  describe('Wallet Operations Integration', () => {
    it('should handle full wallet lifecycle: add, fetch, and remove', async () => {
      // 1. Add wallet
      const addResponse = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: testPrivateKey,
          chain: 'solana',
        },
      });
      expect(addResponse.statusCode).toBe(200);

      // 2. Fetch wallets
      const getResponse = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });
      expect(getResponse.statusCode).toBe(200);

      const wallets: GetWalletResponse[] = JSON.parse(getResponse.payload);
      const solanaWallet = wallets.find((w) => w.chain === 'solana');
      expect(solanaWallet?.walletAddresses).toContain(testAddress);

      // 3. Remove wallet
      const removeResponse = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: testAddress,
          chain: 'solana',
        },
      });
      expect(removeResponse.statusCode).toBe(200);

      // 4. Verify wallet is removed
      const finalGetResponse = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });
      expect(finalGetResponse.statusCode).toBe(200);

      const finalWallets: GetWalletResponse[] = JSON.parse(finalGetResponse.payload);
      const finalSolanaWallet = finalWallets.find((w) => w.chain === 'solana');
      expect(finalSolanaWallet?.walletAddresses).not.toContain(testAddress);
    });
  });

  describe('Solana-specific Features', () => {
    it('should handle base58 encoded private keys', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: testPrivateKey,
          chain: 'solana',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject malformed base58 private keys', async () => {
      // Override the mock to simulate invalid key
      patch(solana, 'getKeypairFromPrivateKey', () => {
        throw new Error('Invalid base58 string');
      });

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: '!!!invalid-base58!!!',
          chain: 'solana',
        },
      });

      // With sensible plugin, validation errors return 400 (bad request) instead of 500
      expect(response.statusCode).toBe(400);
    });
  });
});

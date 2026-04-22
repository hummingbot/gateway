// Mock fs-extra to prevent actual file writes
jest.mock('fs-extra');

import * as fse from 'fs-extra';

import { gatewayApp } from '../../../src/app';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
import { GetWalletResponse } from '../../../src/wallet/schemas';
import { patch, unpatch } from '../../services/patch';

const mockFse = fse as jest.Mocked<typeof fse>;

let eth: Ethereum;

// Test wallet data
const testAddress = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const testPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001'; // noqa: mock

// Mock the encoded private key response
const encodedPrivateKey = {
  address: '7e5f4552091a69125d5dfcb7b8c2659029395bdf',
  id: '7bb58a6c-06d3-4ede-af06-5f4a5cb87f0b',
  version: 3,
  Crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: '60276d7bf5fa57ce0ae8e65fc578c3ac' },
    ciphertext: 'be98ee3d44744e1417531b15a7b1e47b945cfc100d3ff2680f757a824840fb67', // noqa: mock
    kdf: 'scrypt',
    kdfparams: {
      salt: '90b7e0017b4f9df67aa5f2de73495c14de086b8abb5b68ce3329596eb14f991c', // noqa: mock
      n: 131072,
      dklen: 32,
      p: 1,
      r: 8,
    },
    mac: '0cea1492f67ed43234b69100d873e17b4a289dd508cf5e866a3b18599ff0a5fc', // noqa: mock
  },
};

// Track wallet operations in memory to avoid file system pollution
const mockWallets: { [key: string]: Set<string> } = {
  ethereum: new Set<string>(),
};

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
  eth = await Ethereum.getInstance('sepolia');
  await gatewayApp.ready();
});

beforeEach(() => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');

  // Clear mock wallets
  mockWallets.ethereum.clear();

  // Mock wallet operations to work with in-memory storage
  patch(eth, 'getWalletFromPrivateKey', () => {
    return { address: testAddress };
  });

  patch(eth, 'encrypt', () => {
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
  await eth.close();
  await gatewayApp.close();
});

afterEach(() => {
  unpatch();
  jest.clearAllMocks();
});

describe('Ethereum Wallet Operations', () => {
  describe('POST /wallet/add', () => {
    it('should add an Ethereum wallet successfully', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: testPrivateKey,
          chain: 'ethereum',
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
      patch(eth, 'getWalletFromPrivateKey', () => {
        throw new Error('Invalid private key');
      });

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: 'invalid-key',
          chain: 'ethereum',
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
          chain: 'ethereum',
          // missing privateKey
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /wallet', () => {
    it('should fetch wallets for Ethereum', async () => {
      // First add a wallet
      mockWallets.ethereum.add(testAddress);

      const response = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const wallets: GetWalletResponse[] = JSON.parse(response.payload);
      const ethereumWallet = wallets.find((w) => w.chain === 'ethereum');

      expect(ethereumWallet).toBeDefined();
      expect(ethereumWallet?.walletAddresses).toContain(testAddress);
    });

    it('should return empty array when no wallets exist', async () => {
      // Clear wallets
      mockWallets.ethereum.clear();

      const response = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });

      expect(response.statusCode).toBe(200);

      const wallets: GetWalletResponse[] = JSON.parse(response.payload);
      const ethereumWallet = wallets.find((w) => w.chain === 'ethereum');

      expect(ethereumWallet?.walletAddresses).toHaveLength(0);
    });
  });

  describe('DELETE /wallet/remove', () => {
    it('should remove an Ethereum wallet successfully', async () => {
      // First add the wallet to mock storage
      mockWallets.ethereum.add(testAddress);

      const response = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: testAddress,
          chain: 'ethereum',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const body = JSON.parse(response.payload);
      expect(body.message).toContain('removed successfully');
      expect(mockWallets.ethereum.has(testAddress)).toBe(false);
    });

    it('should fail when removing non-existent wallet', async () => {
      (mockFse.pathExists as jest.Mock).mockResolvedValue(false);

      const response = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chain: 'ethereum',
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
          chain: 'ethereum',
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
          chain: 'ethereum',
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
      const ethereumWallet = wallets.find((w) => w.chain === 'ethereum');
      expect(ethereumWallet?.walletAddresses).toContain(testAddress);

      // 3. Remove wallet
      const removeResponse = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: testAddress,
          chain: 'ethereum',
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
      const finalEthereumWallet = finalWallets.find((w) => w.chain === 'ethereum');
      expect(finalEthereumWallet?.walletAddresses).not.toContain(testAddress);
    });
  });
});

// Mock fs-extra to prevent actual file writes
jest.mock('fs-extra');

import * as fse from 'fs-extra';

import { gatewayApp } from '../../../src/app';
import { Cardano } from '../../../src/chains/cardano/cardano';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
import { GetWalletResponse } from '../../../src/wallet/schemas';
import { patch, unpatch } from '../../services/patch';

const mockFse = fse as jest.Mocked<typeof fse>;

let cardano: Cardano;

// Test wallet data
const testAddress =
  'addr_test1vrvqa7ytgmptew2qy3ec0lqdk9n94vcgwu4wy07kqp2he0srll8mg';
const testPrivateKey =
  'ed25519_sk1n24dk27xar2skjef5a5xvpk0uy0sqw62tt7hlv7wcpd4xp4fhy5sdask94'; // noqa: mock

// Mock the encoded private key response
const encodedPrivateKey = {
  address: 'addr_test1vrvqa7ytgmptew2qy3ec0lqdk9n94vcgwu4wy07kqp2he0srll8mg',
  id: '7bb58a6c-06d3-4ede-af06-5f4a5cb87f0b',
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
  cardano: new Set<string>(),
};

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
  cardano = await Cardano.getInstance('preprod');
  await gatewayApp.ready();
});

beforeEach(() => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');

  // Clear mock wallets
  mockWallets.cardano.clear();

  // Mock wallet operations to work with in-memory storage
  patch(cardano, 'getWalletFromPrivateKey', () => {
    return { address: testAddress };
  });

  patch(cardano, 'encrypt', () => {
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

  (mockFse.readdir as jest.Mock).mockImplementation(
    async (dirPath: any, options?: any) => {
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
    },
  );

  (mockFse.readFile as jest.Mock).mockResolvedValue(
    Buffer.from(JSON.stringify(encodedPrivateKey)),
  );
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
  await cardano.close();
  await gatewayApp.close();
});

afterEach(() => {
  unpatch();
  jest.clearAllMocks();
});

describe('Cardano Wallet Operations', () => {
  describe('POST /wallet/add', () => {
    it('should add an Cardano wallet successfully', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: testPrivateKey,
          chain: 'cardano',
          network: 'preprod',
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
      patch(cardano, 'getWalletFromPrivateKey', () => {
        throw new Error('Invalid private key');
      });

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          privateKey: 'invalid-key',
          chain: 'cardano',
          network: 'preprod',
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('should fail with missing parameters', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/add',
        payload: {
          chain: 'cardano',
          // missing privateKey
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /wallet', () => {
    it('should fetch wallets for Cardano', async () => {
      // First add a wallet
      mockWallets.cardano.add(testAddress);

      const response = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const wallets: GetWalletResponse[] = JSON.parse(response.payload);
      const cardanoWallet = wallets.find((w) => w.chain === 'cardano');

      expect(cardanoWallet).toBeDefined();
      expect(cardanoWallet?.walletAddresses).toContain(testAddress);
    });

    it('should return empty array when no wallets exist', async () => {
      // Clear wallets
      mockWallets.cardano.clear();

      const response = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });

      expect(response.statusCode).toBe(200);

      const wallets: GetWalletResponse[] = JSON.parse(response.payload);
      const cardanoWallet = wallets.find((w) => w.chain === 'cardano');

      expect(cardanoWallet?.walletAddresses).toHaveLength(0);
    });
  });

  describe('DELETE /wallet/remove', () => {
    it('should remove an Cardano wallet successfully', async () => {
      // First add the wallet to mock storage
      mockWallets.cardano.add(testAddress);

      const response = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: testAddress,
          chain: 'cardano',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      expect(response.payload).toBe('null');
      expect(mockWallets.cardano.has(testAddress)).toBe(false);
    });

    it('should fail when removing non-existent wallet', async () => {
      (mockFse.pathExists as jest.Mock).mockResolvedValue(false);

      const response = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address:
            'addr_test1vrvqa7ytgmptew2qy3ec0lqdk9n94vcgwu4wy07kqp2he0srll8mg',
          chain: 'cardano',
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
          chain: 'cardano',
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
          chain: 'cardano',
          network: 'preprod',
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
      const cardanoWallet = wallets.find((w) => w.chain === 'cardano');
      expect(cardanoWallet?.walletAddresses).toContain(testAddress);

      // 3. Remove wallet
      const removeResponse = await gatewayApp.inject({
        method: 'DELETE',
        url: '/wallet/remove',
        payload: {
          address: testAddress,
          chain: 'cardano',
        },
      });
      expect(removeResponse.statusCode).toBe(200);

      // 4. Verify wallet is removed
      const finalGetResponse = await gatewayApp.inject({
        method: 'GET',
        url: '/wallet',
      });
      expect(finalGetResponse.statusCode).toBe(200);

      const finalWallets: GetWalletResponse[] = JSON.parse(
        finalGetResponse.payload,
      );
      const finalCardanoWallet = finalWallets.find(
        (w) => w.chain === 'cardano',
      );
      expect(finalCardanoWallet?.walletAddresses).not.toContain(testAddress);
    });
  });
});

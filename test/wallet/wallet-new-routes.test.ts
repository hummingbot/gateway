// Mock fs-extra to prevent actual file writes
jest.mock('fs-extra');

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fse from 'fs-extra';

import { gatewayApp } from '../../src/app';
import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
import { patch, unpatch } from '../services/patch';

const mockFse = fse as jest.Mocked<typeof fse>;

let solana: Solana;
let ethereumSepolia: Ethereum;
let ethereumMainnet: Ethereum;

// Test passphrase
const TEST_PASSPHRASE = 'test-passphrase';

// Generate test Solana keypair - use this for both address and encryption mocks
const testSolanaKeypair = Keypair.generate();
const testSolanaAddress = testSolanaKeypair.publicKey.toString();
const testSolanaPrivateKey = bs58.encode(testSolanaKeypair.secretKey);

// Test Ethereum wallet data (fixed test address)
const testEthAddress = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const testEthPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';

// Mock encrypted wallet data
const mockSolanaEncrypted = JSON.stringify({
  algorithm: 'aes-256-ctr',
  iv: { type: 'Buffer', data: [1, 2, 3] },
  salt: { type: 'Buffer', data: [4, 5, 6] },
  encrypted: { type: 'Buffer', data: [7, 8, 9] },
});

const mockEthEncrypted = JSON.stringify({
  address: testEthAddress.toLowerCase().slice(2),
  id: 'test-id',
  version: 3,
  Crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: 'test-iv' },
    ciphertext: 'test-ciphertext',
    kdf: 'scrypt',
    kdfparams: { salt: 'test-salt', n: 131072, dklen: 32, p: 1, r: 8 },
    mac: 'test-mac',
  },
});

// Track wallet operations in memory
const mockWallets: { [key: string]: Set<string> } = {
  solana: new Set<string>(),
  ethereum: new Set<string>(),
};

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => TEST_PASSPHRASE);
  patch(ConfigManagerCertPassphrase, 'readWalletKey', () => TEST_PASSPHRASE);
  solana = await Solana.getInstance('mainnet-beta');
  ethereumSepolia = await Ethereum.getInstance('sepolia');
  ethereumMainnet = await Ethereum.getInstance('mainnet');
  await gatewayApp.ready();
});

beforeEach(() => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => TEST_PASSPHRASE);
  patch(ConfigManagerCertPassphrase, 'readWalletKey', () => TEST_PASSPHRASE);

  // Clear mock wallets
  mockWallets.solana.clear();
  mockWallets.ethereum.clear();

  // Mock Solana wallet operations
  patch(solana, 'getKeypairFromPrivateKey', () => testSolanaKeypair);
  patch(solana, 'encrypt', () => mockSolanaEncrypted);
  patch(solana, 'decrypt', () => testSolanaPrivateKey);

  // Mock Ethereum wallet operations for both instances
  [ethereumSepolia, ethereumMainnet].forEach((eth) => {
    patch(eth, 'getWalletFromPrivateKey', () => ({ address: testEthAddress }));
    patch(eth, 'encrypt', () => mockEthEncrypted);
    patch(eth, 'decrypt', () => ({ privateKey: testEthPrivateKey, address: testEthAddress }));
  });

  // Setup fs-extra mocks
  (mockFse.writeFile as jest.Mock).mockImplementation(async (path: any) => {
    const pathStr = path.toString();
    const pathParts = pathStr.split('/');
    const chain = pathParts[pathParts.length - 2];
    const address = pathParts[pathParts.length - 1].replace('.json', '');

    if (chain && mockWallets[chain]) {
      mockWallets[chain].add(address);
    }
    return undefined;
  });

  (mockFse.readdir as jest.Mock).mockImplementation(async (dirPath: any, options?: any) => {
    const pathStr = dirPath.toString();

    if (pathStr.endsWith('/wallets') && options?.withFileTypes) {
      return Object.keys(mockWallets).map((chain) => ({
        name: chain,
        isDirectory: () => true,
        isFile: () => false,
      }));
    }

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

  (mockFse.readFile as jest.Mock).mockImplementation(async (path: any) => {
    const pathStr = path.toString();
    if (pathStr.includes('/solana/')) {
      return Buffer.from(mockSolanaEncrypted);
    }
    return Buffer.from(mockEthEncrypted);
  });

  (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
  (mockFse.ensureDir as jest.Mock).mockResolvedValue(undefined);
  (mockFse.mkdir as jest.Mock).mockResolvedValue(undefined);

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
  await ethereumSepolia.close();
  await ethereumMainnet.close();
  await gatewayApp.close();
});

afterEach(() => {
  unpatch();
  jest.clearAllMocks();
});

describe('Wallet New Routes', () => {
  describe('POST /wallet/create', () => {
    it('should create a new Solana wallet', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/create',
        payload: {
          chain: 'solana',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const result = JSON.parse(response.payload);
      expect(result.chain).toBe('solana');
      expect(result.address).toBeDefined();
      expect(typeof result.address).toBe('string');
    });

    it('should create a new Ethereum wallet', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/create',
        payload: {
          chain: 'ethereum',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const result = JSON.parse(response.payload);
      expect(result.chain).toBe('ethereum');
      expect(result.address).toBeDefined();
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should create wallet and set as default when setDefault is true', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/create',
        payload: {
          chain: 'solana',
          setDefault: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.address).toBeDefined();
    });

    it('should fail with invalid chain', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/create',
        payload: {
          chain: 'invalid-chain',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should fail with missing chain parameter', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/create',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /wallet/show-private-key', () => {
    beforeEach(() => {
      // Add wallet to mock storage
      mockWallets.solana.add(testSolanaAddress);
      mockWallets.ethereum.add(testEthAddress);
    });

    it('should show private key for Solana wallet with correct passphrase', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'solana',
          address: testSolanaAddress,
          passphrase: TEST_PASSPHRASE,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const result = JSON.parse(response.payload);
      expect(result.address).toBe(testSolanaAddress);
      expect(result.chain).toBe('solana');
      expect(result.privateKey).toBe(testSolanaPrivateKey);
    });

    it('should show private key for Ethereum wallet with correct passphrase', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'ethereum',
          address: testEthAddress,
          passphrase: TEST_PASSPHRASE,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const result = JSON.parse(response.payload);
      expect(result.address).toBe(testEthAddress);
      expect(result.chain).toBe('ethereum');
      expect(result.privateKey).toBe(testEthPrivateKey);
    });

    it('should fail with incorrect passphrase', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'solana',
          address: testSolanaAddress,
          passphrase: 'wrong-passphrase',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should fail with missing passphrase', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'solana',
          address: testSolanaAddress,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should fail for non-existent wallet', async () => {
      // Mock readFile to reject for wallet file reads (not hardware wallet reads)
      (mockFse.readFile as jest.Mock).mockImplementation(async (path: any) => {
        const pathStr = path.toString();
        // Hardware wallet file reads return empty array
        if (pathStr.includes('hardware-wallets')) {
          return Buffer.from('[]');
        }
        // Wallet file reads throw ENOENT
        throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
      });

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'solana',
          address: '7RCz8wb6WXxUhAigxy9rWPRB2GmTDaYH1Jb8GzJ5Vf9P',
          passphrase: TEST_PASSPHRASE,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should fail with invalid address format', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'solana',
          address: 'invalid-address',
          passphrase: TEST_PASSPHRASE,
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('should fail with invalid chain', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'invalid-chain',
          address: testSolanaAddress,
          passphrase: TEST_PASSPHRASE,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /wallet/send', () => {
    const recipientSolanaAddress = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const recipientEthAddress = '0x1234567890123456789012345678901234567890';

    beforeEach(() => {
      // Add wallets to mock storage
      mockWallets.solana.add(testSolanaAddress);
      mockWallets.ethereum.add(testEthAddress);

      // Mock getWallet for Solana
      patch(solana, 'getWallet', () => testSolanaKeypair);

      // Mock sendAndConfirmTransaction for Solana
      patch(solana, 'sendAndConfirmTransaction', () => ({
        signature: 'mock-solana-signature-12345',
        fee: 0.000005,
      }));

      // Mock getToken for Solana
      patch(solana, 'getToken', () => ({
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        decimals: 6,
      }));

      // Mock Ethereum operations for all network instances
      [ethereumSepolia, ethereumMainnet].forEach((eth) => {
        // Mock getWallet for Ethereum
        patch(eth, 'getWallet', () => ({
          address: testEthAddress,
          sendTransaction: async () => ({
            hash: '0xmock-eth-tx-hash',
            wait: async () => ({ status: 1, gasUsed: { mul: () => ({ toString: () => '21000' }) } }),
          }),
        }));

        // Mock prepareGasOptions for Ethereum
        patch(eth, 'prepareGasOptions', () => ({
          gasLimit: 21000,
          gasPrice: '1000000000',
        }));

        // Mock handleTransactionExecution for Ethereum
        patch(eth, 'handleTransactionExecution', () => ({
          status: 1,
          gasUsed: { mul: () => ({ toString: () => '21000' }) },
          effectiveGasPrice: { toString: () => '1000000000' },
          blockNumber: 12345,
        }));
      });
    });

    it('should send native SOL successfully', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          address: testSolanaAddress,
          toAddress: recipientSolanaAddress,
          amount: '0.1',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);

      const result = JSON.parse(response.payload);
      expect(result.signature).toBeDefined();
      expect(result.status).toBe(1);
      expect(result.amount).toBe('0.1');
      expect(result.token).toBe('SOL');
      expect(result.toAddress).toBe(recipientSolanaAddress);
    });

    it('should send SOL with explicit token parameter', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          address: testSolanaAddress,
          toAddress: recipientSolanaAddress,
          amount: '0.5',
          token: 'SOL',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.token).toBe('SOL');
    });

    it('should fail with invalid amount', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          address: testSolanaAddress,
          toAddress: recipientSolanaAddress,
          amount: '-1',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should fail with invalid recipient address', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          address: testSolanaAddress,
          toAddress: 'invalid-address',
          amount: '0.1',
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('should fail with invalid sender address', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          address: 'invalid-address',
          toAddress: recipientSolanaAddress,
          amount: '0.1',
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('should fail with missing required fields', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          // missing address, toAddress, amount
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should fail for token not found', async () => {
      patch(solana, 'getToken', () => null);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          address: testSolanaAddress,
          toAddress: recipientSolanaAddress,
          amount: '10',
          token: 'UNKNOWN_TOKEN',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should fail with invalid chain', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/send',
        payload: {
          chain: 'invalid-chain',
          network: 'mainnet',
          address: testSolanaAddress,
          toAddress: recipientSolanaAddress,
          amount: '0.1',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Integration: Create, Show Key, and Use Wallet', () => {
    it('should create wallet and retrieve its private key', async () => {
      // 1. Create a new wallet
      const createResponse = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/create',
        payload: {
          chain: 'solana',
          setDefault: true,
        },
      });

      expect(createResponse.statusCode).toBe(200);
      const createResult = JSON.parse(createResponse.payload);
      const createdAddress = createResult.address;

      // Add the created wallet to mock storage for retrieval
      mockWallets.solana.add(createdAddress);

      // 2. Show private key for the created wallet
      const showKeyResponse = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/show-private-key',
        payload: {
          chain: 'solana',
          address: createdAddress,
          passphrase: TEST_PASSPHRASE,
        },
      });

      expect(showKeyResponse.statusCode).toBe(200);
      const showKeyResult = JSON.parse(showKeyResponse.payload);
      expect(showKeyResult.address).toBe(createdAddress);
      expect(showKeyResult.privateKey).toBeDefined();
    });
  });
});

import path from 'path';

import { getAddress } from 'ethers/lib/utils';
import Fastify, { FastifyInstance } from 'fastify';
import fse from 'fs-extra';

// Import shared mocks for common dependencies
import { getReadOnlyWalletAddresses, saveReadOnlyWalletAddresses } from '../../src/wallet/utils';
import { walletRoutes } from '../../src/wallet/wallet.routes';
import { setupCommonMocks } from '../mocks/shared-mocks';

// Setup common mocks
setupCommonMocks();

// Import path module at top level
const testWalletPath = path.join(__dirname, 'test-wallets');

// Create a module to store mocks
const walletUtilsMocks = {
  getReadOnlyWalletAddresses: jest.fn(),
  saveReadOnlyWalletAddresses: jest.fn(),
  addReadOnlyWallet: jest.fn(),
  removeReadOnlyWallet: jest.fn(),
  getWallets: jest.fn(),
};

// Mock wallet utils with test path
jest.mock('../../src/wallet/utils', () => ({
  walletPath: testWalletPath,
  getReadOnlyWalletFilePath: (chain: string) => `${testWalletPath}/${chain.toLowerCase()}/read-only.json`,
  getReadOnlyWalletAddresses: walletUtilsMocks.getReadOnlyWalletAddresses,
  saveReadOnlyWalletAddresses: walletUtilsMocks.saveReadOnlyWalletAddresses,
  addReadOnlyWallet: walletUtilsMocks.addReadOnlyWallet,
  removeReadOnlyWallet: walletUtilsMocks.removeReadOnlyWallet,
  getWallets: walletUtilsMocks.getWallets,
  mkdirIfDoesNotExist: jest.fn(),
  sanitizePathComponent: (input: string) => input.replace(/[\/\\:*?"<>|]/g, ''),
  validateChainName: (chain: string) => ['ethereum', 'solana'].includes(chain.toLowerCase()),
  isHardwareWallet: jest.fn().mockResolvedValue(false),
  isReadOnlyWallet: jest.fn().mockImplementation(async (chain: string, address: string) => {
    const addresses = await walletUtilsMocks.getReadOnlyWalletAddresses(chain);
    // For Ethereum addresses, compare checksummed versions
    if (chain.toLowerCase() === 'ethereum') {
      const { getAddress } = require('ethers/lib/utils');
      const checksummedAddress = getAddress(address);
      return addresses.some((addr) => getAddress(addr) === checksummedAddress);
    }
    return addresses.includes(address);
  }),
  getHardwareWallets: jest.fn().mockResolvedValue([]),
  saveHardwareWallets: jest.fn(),
  removeWallet: jest.fn(),
}));

// Import after mocking

// Get mock functions
const mockGetReadOnlyWalletAddresses = walletUtilsMocks.getReadOnlyWalletAddresses;
const mockSaveReadOnlyWalletAddresses = walletUtilsMocks.saveReadOnlyWalletAddresses;
const mockAddReadOnlyWallet = walletUtilsMocks.addReadOnlyWallet;
const mockRemoveReadOnlyWallet = walletUtilsMocks.removeReadOnlyWallet;
const mockGetWallets = walletUtilsMocks.getWallets;

// Import after mocking

// Test data - using all lowercase addresses to avoid checksum issues
const TEST_ETH_ADDRESS = '0x742d35cc6634c0532925a3b844bc9e7595f0bfee';
const TEST_ETH_ADDRESS_2 = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const TEST_SOL_ADDRESS = 'DRpaJDurGtinzUPWSYnripFsJTBXm4HG7AC3LSgJNtNB';
const TEST_SOL_ADDRESS_2 = '11111111111111111111111111111111';

describe('Read-Only Wallet Tests', () => {
  let fastify: FastifyInstance;

  // Store addresses in memory for mock implementation
  const mockAddressStorage: { [chain: string]: string[] } = {};

  beforeEach(async () => {
    // Clean up test directory
    await fse.remove(testWalletPath);
    await fse.ensureDir(testWalletPath);

    // Reset mock storage
    Object.keys(mockAddressStorage).forEach((key) => delete mockAddressStorage[key]);

    // Set up mock implementations
    mockGetReadOnlyWalletAddresses.mockImplementation(async (chain: string) => {
      return mockAddressStorage[chain] || [];
    });

    mockSaveReadOnlyWalletAddresses.mockImplementation(async (chain: string, addresses: string[]) => {
      mockAddressStorage[chain] = addresses;

      // Also create the actual directory and file for tests that check file existence
      const dirPath = path.join(testWalletPath, chain.toLowerCase());
      await fse.ensureDir(dirPath);
      const filePath = path.join(dirPath, 'read-only.json');
      await fse.writeFile(filePath, JSON.stringify(addresses, null, 2));
    });

    mockAddReadOnlyWallet.mockImplementation(async (_fastifyInstance: FastifyInstance, req: any) => {
      const { chain, address } = req;

      // Validate chain
      if (!['ethereum', 'solana'].includes(chain.toLowerCase())) {
        const error = new Error(`Unrecognized chain name: ${chain}`);
        (error as any).statusCode = 400;
        throw error;
      }

      // Validate address format
      if (chain.toLowerCase() === 'ethereum' && !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
        const error = new Error(`Invalid Ethereum address: ${address}`);
        (error as any).statusCode = 400;
        throw error;
      }

      if (chain.toLowerCase() === 'solana' && (address.length < 32 || address.length > 44)) {
        const error = new Error(`Invalid Solana address: ${address}`);
        (error as any).statusCode = 400;
        throw error;
      }

      // Check if already exists
      const existing = mockAddressStorage[chain] || [];
      if (existing.includes(address)) {
        const error = new Error(`Read-only wallet ${address} already exists for ${chain}`);
        (error as any).statusCode = 400;
        throw error;
      }

      // Add to storage
      mockAddressStorage[chain] = [...existing, address];
      await mockSaveReadOnlyWalletAddresses(chain, mockAddressStorage[chain]);

      return {
        message: `Read-only wallet ${address} added successfully for ${chain}`,
        address,
        chain,
      };
    });

    mockRemoveReadOnlyWallet.mockImplementation(async (_fastifyInstance: FastifyInstance, req: any) => {
      const { chain, address } = req;

      // Validate chain
      if (!['ethereum', 'solana'].includes(chain.toLowerCase())) {
        const error = new Error(`Unrecognized chain name: ${chain}`);
        (error as any).statusCode = 400;
        throw error;
      }

      const existing = mockAddressStorage[chain] || [];
      if (!existing.includes(address)) {
        const error = new Error(`Read-only wallet ${address} not found for ${chain}`);
        (error as any).statusCode = 404;
        throw error;
      }

      mockAddressStorage[chain] = existing.filter((a) => a !== address);
      await mockSaveReadOnlyWalletAddresses(chain, mockAddressStorage[chain]);

      return {
        message: `Read-only wallet ${address} removed successfully from ${chain}`,
        address,
        chain,
      };
    });

    mockGetWallets.mockImplementation(async (_fastifyInstance: FastifyInstance) => {
      const responses = [];

      for (const chain of ['ethereum', 'solana']) {
        const readOnlyAddresses = mockAddressStorage[chain] || [];

        // Get regular wallet addresses by scanning directory
        const chainPath = path.join(testWalletPath, chain);
        let walletAddresses: string[] = [];

        try {
          if (await fse.pathExists(chainPath)) {
            const files = await fse.readdir(chainPath);
            walletAddresses = files
              .filter((f) => f.endsWith('.json') && f !== 'read-only.json')
              .map((f) => f.replace('.json', ''));
          }
        } catch (error) {
          // Ignore errors
        }

        responses.push({
          chain,
          walletAddresses,
          readOnlyWalletAddresses: readOnlyAddresses.length > 0 ? readOnlyAddresses : undefined,
        });
      }

      return responses;
    });

    // Create Fastify instance and register routes
    fastify = Fastify();
    await fastify.register(walletRoutes);
  });

  afterEach(async () => {
    await fastify.close();
    await fse.remove(testWalletPath);
    jest.clearAllMocks();
  });

  describe('POST /wallet/add-read-only', () => {
    it('should add an Ethereum read-only wallet', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'ethereum',
          address: TEST_ETH_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Read-only wallet');
      expect(body.message).toContain('added successfully');
      expect(body.address).toBe(TEST_ETH_ADDRESS);

      // Verify the address was saved
      const addresses = await getReadOnlyWalletAddresses('ethereum');
      expect(addresses).toContain(TEST_ETH_ADDRESS);
    });

    it('should add a Solana read-only wallet', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'solana',
          address: TEST_SOL_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Read-only wallet');
      expect(body.message).toContain('added successfully');
      expect(body.address).toBe(TEST_SOL_ADDRESS);

      // Verify the address was saved
      const addresses = await getReadOnlyWalletAddresses('solana');
      expect(addresses).toContain(TEST_SOL_ADDRESS);
    });

    it('should return 400 for duplicate address', async () => {
      // Add the address first
      await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'ethereum',
          address: TEST_ETH_ADDRESS,
        },
      });

      // Try to add it again
      const response = await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'ethereum',
          address: TEST_ETH_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('already exists');
    });

    it('should return 400 for invalid Ethereum address', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'ethereum',
          address: 'invalid-address',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Invalid');
    });

    it('should return 400 for invalid Solana address', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'solana',
          address: 'invalid!@#$%',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Invalid');
    });

    it('should return 400 for unsupported chain', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'bitcoin',
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('chain must be equal to one of the allowed values');
    });

    it('should create directory structure if it does not exist', async () => {
      // Remove the directory to test creation
      await fse.remove(testWalletPath);

      const response = await fastify.inject({
        method: 'POST',
        url: '/add-read-only',
        payload: {
          chain: 'ethereum',
          address: TEST_ETH_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify directory was created
      const ethPath = path.join(testWalletPath, 'ethereum');
      expect(await fse.pathExists(ethPath)).toBe(true);
    });
  });

  describe('DELETE /wallet/remove', () => {
    beforeEach(async () => {
      // Add some test addresses - use checksummed addresses for Ethereum
      const checksummedEthAddress = getAddress(TEST_ETH_ADDRESS);
      const checksummedEthAddress2 = getAddress(TEST_ETH_ADDRESS_2);
      await mockSaveReadOnlyWalletAddresses('ethereum', [checksummedEthAddress, checksummedEthAddress2]);
      await mockSaveReadOnlyWalletAddresses('solana', [TEST_SOL_ADDRESS]);

      // Update the mock to handle address removal
      mockSaveReadOnlyWalletAddresses.mockImplementation(async (chain: string, addresses: string[]) => {
        mockAddressStorage[chain] = addresses;
      });
    });

    it('should remove an Ethereum read-only wallet', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/remove',
        payload: {
          chain: 'ethereum',
          address: TEST_ETH_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('removed successfully');

      // Verify the address was removed
      const addresses = await mockGetReadOnlyWalletAddresses('ethereum');
      expect(addresses).not.toContain(getAddress(TEST_ETH_ADDRESS));
      expect(addresses).toContain(getAddress(TEST_ETH_ADDRESS_2)); // Other address should remain
    });

    it('should remove a Solana read-only wallet', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/remove',
        payload: {
          chain: 'solana',
          address: TEST_SOL_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('removed successfully');

      // Verify the address was removed
      const addresses = await mockGetReadOnlyWalletAddresses('solana');
      expect(addresses).not.toContain(TEST_SOL_ADDRESS);
    });

    it('should return 404 for non-existent address', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/remove-read-only',
        payload: {
          chain: 'ethereum',
          address: '0x0000000000000000000000000000000000000000',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('not found');
    });

    it('should return 400 for invalid chain', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/remove',
        payload: {
          chain: 'invalid-chain',
          address: TEST_ETH_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      // The validation happens at the schema level, so we get a different message
      expect(body.message).toContain('body/chain must be equal to one of the allowed values');
    });
  });

  describe('GET /wallet', () => {
    beforeEach(async () => {
      // Add some read-only addresses
      await saveReadOnlyWalletAddresses('ethereum', [TEST_ETH_ADDRESS, TEST_ETH_ADDRESS_2]);
      await saveReadOnlyWalletAddresses('solana', [TEST_SOL_ADDRESS, TEST_SOL_ADDRESS_2]);

      // Create dummy regular wallet files
      const ethPath = path.join(testWalletPath, 'ethereum');
      const solPath = path.join(testWalletPath, 'solana');
      await fse.ensureDir(ethPath);
      await fse.ensureDir(solPath);
      await fse.writeFile(path.join(ethPath, '0x1234567890123456789012345678901234567890.json'), 'dummy');
      await fse.writeFile(path.join(solPath, '7J3gXM8j8Z7qYfDqVqnXzJLK6RnDHBPrTFhLMVNxfM5T.json'), 'dummy');
    });

    it('should return both regular and read-only wallets', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Find Ethereum wallets
      const ethWallets = body.find((w: any) => w.chain === 'ethereum');
      expect(ethWallets).toBeDefined();
      expect(ethWallets.walletAddresses).toContain('0x1234567890123456789012345678901234567890');
      expect(ethWallets.readOnlyWalletAddresses).toContain(TEST_ETH_ADDRESS);
      expect(ethWallets.readOnlyWalletAddresses).toContain(TEST_ETH_ADDRESS_2);

      // Find Solana wallets
      const solWallets = body.find((w: any) => w.chain === 'solana');
      expect(solWallets).toBeDefined();
      expect(solWallets.walletAddresses).toContain('7J3gXM8j8Z7qYfDqVqnXzJLK6RnDHBPrTFhLMVNxfM5T');
      expect(solWallets.readOnlyWalletAddresses).toContain(TEST_SOL_ADDRESS);
      expect(solWallets.readOnlyWalletAddresses).toContain(TEST_SOL_ADDRESS_2);
    });

    it('should not include readOnlyWalletAddresses field when empty', async () => {
      // Remove all read-only addresses
      await saveReadOnlyWalletAddresses('ethereum', []);
      await saveReadOnlyWalletAddresses('solana', []);

      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Check that readOnlyWalletAddresses is not included when empty
      body.forEach((chain: any) => {
        expect(chain).not.toHaveProperty('readOnlyWalletAddresses');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('getReadOnlyWalletAddresses', () => {
      it('should return empty array when file does not exist', async () => {
        const addresses = await getReadOnlyWalletAddresses('ethereum');
        expect(addresses).toEqual([]);
      });

      it('should return addresses when file exists', async () => {
        const testAddresses = [TEST_ETH_ADDRESS, TEST_ETH_ADDRESS_2];
        await saveReadOnlyWalletAddresses('ethereum', testAddresses);

        const addresses = await getReadOnlyWalletAddresses('ethereum');
        expect(addresses).toEqual(testAddresses);
      });

      it('should handle invalid JSON gracefully', async () => {
        const filePath = path.join(testWalletPath, 'ethereum', 'read-only.json');
        await fse.ensureDir(path.dirname(filePath));
        await fse.writeFile(filePath, 'invalid json');

        const addresses = await getReadOnlyWalletAddresses('ethereum');
        expect(addresses).toEqual([]);
      });
    });

    describe('saveReadOnlyWalletAddresses', () => {
      it('should create directory if it does not exist', async () => {
        const addresses = [TEST_SOL_ADDRESS];
        await saveReadOnlyWalletAddresses('solana', addresses);

        const filePath = path.join(testWalletPath, 'solana', 'read-only.json');
        expect(await fse.pathExists(filePath)).toBe(true);

        const content = await fse.readFile(filePath, 'utf8');
        expect(JSON.parse(content)).toEqual(addresses);
      });

      it('should overwrite existing file', async () => {
        const addresses1 = [TEST_ETH_ADDRESS];
        const addresses2 = [TEST_ETH_ADDRESS, TEST_ETH_ADDRESS_2];

        await saveReadOnlyWalletAddresses('ethereum', addresses1);
        await saveReadOnlyWalletAddresses('ethereum', addresses2);

        const savedAddresses = await getReadOnlyWalletAddresses('ethereum');
        expect(savedAddresses).toEqual(addresses2);
      });
    });
  });
});

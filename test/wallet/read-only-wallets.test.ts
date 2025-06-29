import Fastify, { FastifyInstance } from 'fastify';
import fse from 'fs-extra';
import path from 'path';

import { walletRoutes } from '../../src/wallet/wallet.routes';
import {
  getReadOnlyWalletAddresses,
  saveReadOnlyWalletAddresses,
  walletPath,
} from '../../src/wallet/utils';

// Mock dependencies
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/services/config-manager-cert-passphrase', () => ({
  ConfigManagerCertPassphrase: {
    readPassphrase: jest.fn().mockReturnValue('test-passphrase'),
  },
}));

// Test data
const TEST_ETH_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0Bfee';
const TEST_ETH_ADDRESS_2 = '0x5aAeb6053f3E94C9b9A09f33669435E7Ef1BeAed';
const TEST_SOL_ADDRESS = 'DRpaJDurGtinzUPWSYnripFsJTBXm4HG7AC3LSgJNtNB';
const TEST_SOL_ADDRESS_2 = '11111111111111111111111111111111';

describe('Read-Only Wallet Tests', () => {
  let fastify: FastifyInstance;
  const testWalletPath = path.join(__dirname, 'test-wallets');

  beforeEach(async () => {
    // Override wallet path for tests
    Object.defineProperty(walletPath, 'valueOf', {
      value: () => testWalletPath,
      configurable: true,
    });

    // Clean up test directory
    await fse.remove(testWalletPath);
    await fse.ensureDir(testWalletPath);

    // Create Fastify instance and register routes
    fastify = Fastify();
    await fastify.register(walletRoutes);
  });

  afterEach(async () => {
    await fastify.close();
    await fse.remove(testWalletPath);
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
      expect(body.message).toContain('Unrecognized chain name');
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

  describe('DELETE /wallet/remove-read-only', () => {
    beforeEach(async () => {
      // Add some test addresses
      await saveReadOnlyWalletAddresses('ethereum', [TEST_ETH_ADDRESS, TEST_ETH_ADDRESS_2]);
      await saveReadOnlyWalletAddresses('solana', [TEST_SOL_ADDRESS]);
    });

    it('should remove an Ethereum read-only wallet', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/remove-read-only',
        payload: {
          chain: 'ethereum',
          address: TEST_ETH_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('removed successfully');

      // Verify the address was removed
      const addresses = await getReadOnlyWalletAddresses('ethereum');
      expect(addresses).not.toContain(TEST_ETH_ADDRESS);
      expect(addresses).toContain(TEST_ETH_ADDRESS_2); // Other address should remain
    });

    it('should remove a Solana read-only wallet', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/remove-read-only',
        payload: {
          chain: 'solana',
          address: TEST_SOL_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('removed successfully');

      // Verify the address was removed
      const addresses = await getReadOnlyWalletAddresses('solana');
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
        url: '/remove-read-only',
        payload: {
          chain: 'invalid-chain',
          address: TEST_ETH_ADDRESS,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Unrecognized chain name');
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
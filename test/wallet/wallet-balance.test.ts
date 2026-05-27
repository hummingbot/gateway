// Tests for POST /wallet/balance endpoint
// Uses patch() to spy on Ethereum/Solana.getInstance — never hits real RPC.
import { gatewayApp } from '../../src/app';
import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
import { patch, unpatch } from '../services/patch';

const TEST_PASSPHRASE = 'test-passphrase';
const TEST_ETH_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const TEST_SOL_ADDRESS = '4L5wNH6HJrAW7tErtq8VBQ6oS9BLjnZFLsLaFNcbMGD';

const mockEthBalances: Record<string, number> = { ETH: 1.5, USDC: 500.0 };
const mockBscBalances: Record<string, number> = { BNB: 2.0, CAKE: 100.0 };
const mockSolBalances: Record<string, number> = { SOL: 10.0, USDC: 200.0 };

// Lightweight mock chain instances
const mockEthInstance = {
  getBalances: jest.fn().mockResolvedValue(mockEthBalances),
} as unknown as Ethereum;

const mockSolInstance = {
  getBalances: jest.fn().mockResolvedValue(mockSolBalances),
} as unknown as Solana;

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => TEST_PASSPHRASE);
  patch(ConfigManagerCertPassphrase, 'readWalletKey', () => TEST_PASSPHRASE);
  patch(Ethereum, 'getInstance', async () => mockEthInstance);
  patch(Solana, 'getInstance', async () => mockSolInstance);
  await gatewayApp.ready();
});

afterAll(async () => {
  unpatch();
});

beforeEach(() => {
  (mockEthInstance.getBalances as jest.Mock).mockResolvedValue(mockEthBalances);
  (mockSolInstance.getBalances as jest.Mock).mockResolvedValue(mockSolBalances);
  patch(Ethereum, 'getInstance', async () => mockEthInstance);
  patch(Solana, 'getInstance', async () => mockSolInstance);
});

afterEach(() => {
  unpatch();
});

describe('POST /wallet/balance', () => {
  describe('Ethereum balances', () => {
    it('returns balances for ethereum mainnet', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum', network: 'mainnet', address: TEST_ETH_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('ethereum');
      expect(body.network).toBe('mainnet');
      expect(body.address).toBe(TEST_ETH_ADDRESS);
      expect(body.balances).toBeDefined();
      expect(typeof body.timestamp).toBe('number');
    });

    it('returns balances for bsc via network param', async () => {
      (mockEthInstance.getBalances as jest.Mock).mockResolvedValue(mockBscBalances);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum', network: 'bsc', address: TEST_ETH_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('ethereum');
      expect(body.network).toBe('bsc');
      expect(body.balances).toEqual(mockBscBalances);
    });

    it('returns balances for bsc via chainNetwork shorthand', async () => {
      (mockEthInstance.getBalances as jest.Mock).mockResolvedValue(mockBscBalances);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chainNetwork: 'ethereum-bsc', address: TEST_ETH_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('ethereum');
      expect(body.network).toBe('bsc');
      expect(body.balances).toEqual(mockBscBalances);
    });

    it('passes tokens[] to getBalances when provided', async () => {
      await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum', address: TEST_ETH_ADDRESS, tokens: ['ETH', 'USDC'] },
      });

      expect(mockEthInstance.getBalances).toHaveBeenCalledWith(TEST_ETH_ADDRESS, ['ETH', 'USDC']);
    });

    it('defaults to mainnet when network omitted for ethereum', async () => {
      const instanceSpy = jest.fn().mockResolvedValue(mockEthInstance);
      patch(Ethereum, 'getInstance', instanceSpy);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum', address: TEST_ETH_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).network).toBe('mainnet');
      expect(instanceSpy).toHaveBeenCalledWith('mainnet');
    });

    it('timestamp is within current execution window', async () => {
      const beforeMs = Date.now();
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum', address: TEST_ETH_ADDRESS },
      });
      const afterMs = Date.now();
      const body = JSON.parse(response.body);
      expect(body.timestamp).toBeGreaterThanOrEqual(beforeMs);
      expect(body.timestamp).toBeLessThanOrEqual(afterMs);
    });
  });

  describe('Solana balances', () => {
    it('returns balances for solana mainnet-beta', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'solana', network: 'mainnet-beta', address: TEST_SOL_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('solana');
      expect(body.network).toBe('mainnet-beta');
      expect(body.balances).toEqual(mockSolBalances);
    });

    it('defaults to mainnet-beta when network omitted for solana', async () => {
      const instanceSpy = jest.fn().mockResolvedValue(mockSolInstance);
      patch(Solana, 'getInstance', instanceSpy);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'solana', address: TEST_SOL_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).network).toBe('mainnet-beta');
      expect(instanceSpy).toHaveBeenCalledWith('mainnet-beta');
    });

    it('returns balances via chainNetwork solana-mainnet-beta', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chainNetwork: 'solana-mainnet-beta', address: TEST_SOL_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('solana');
      expect(body.network).toBe('mainnet-beta');
    });
  });

  describe('Error handling', () => {
    it('returns 400 for unknown chain', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'bitcoin', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 4xx when required address field is missing', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum' },
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('propagates chain RPC errors as 500', async () => {
      (mockEthInstance.getBalances as jest.Mock).mockRejectedValue(new Error('RPC timeout'));

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum', address: TEST_ETH_ADDRESS },
      });
      expect(response.statusCode).toBe(500);
    });

    it('returns 400 when neither chain nor chainNetwork is provided', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { address: TEST_ETH_ADDRESS },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for malformed chainNetwork with no hyphen', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chainNetwork: 'ethereummainnet', address: TEST_ETH_ADDRESS },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('chain + address only (no network field)', () => {
    it('returns 200 with mainnet when only chain and address provided', async () => {
      const instanceSpy = jest.fn().mockResolvedValue(mockEthInstance);
      patch(Ethereum, 'getInstance', instanceSpy);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'ethereum', address: TEST_ETH_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('ethereum');
      expect(body.network).toBe('mainnet');
      expect(body.address).toBe(TEST_ETH_ADDRESS);
      expect(instanceSpy).toHaveBeenCalledWith('mainnet');
    });

    it('returns 200 with mainnet-beta when only chain=solana and address provided', async () => {
      const instanceSpy = jest.fn().mockResolvedValue(mockSolInstance);
      patch(Solana, 'getInstance', instanceSpy);

      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chain: 'solana', address: TEST_SOL_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).network).toBe('mainnet-beta');
      expect(instanceSpy).toHaveBeenCalledWith('mainnet-beta');
    });

    it('accepts ethereum-mainnet as chainNetwork and defaults network correctly', async () => {
      const response = await gatewayApp.inject({
        method: 'POST',
        url: '/wallet/balance',
        payload: { chainNetwork: 'ethereum-mainnet', address: TEST_ETH_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).network).toBe('mainnet');
    });
  });
});

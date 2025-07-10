import sensible from '@fastify/sensible';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../src/services/hardware-wallet-service');
jest.mock('../../src/wallet/utils');
jest.mock('../../src/chains/solana/solana');
jest.mock('../../src/chains/ethereum/ethereum');

import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { HardwareWalletService } from '../../src/services/hardware-wallet-service';
import { hardwareWalletRoutes } from '../../src/wallet/hardware-wallet.routes';
import { getHardwareWallets, saveHardwareWallets, validateChainName } from '../../src/wallet/utils';

describe('Hardware Wallet Routes', () => {
  let app: FastifyInstance;
  let mockHardwareWalletService: jest.Mocked<HardwareWalletService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    app = Fastify();
    await app.register(hardwareWalletRoutes);

    mockHardwareWalletService = {
      isDeviceConnected: jest.fn().mockResolvedValue(true),
      getSolanaAddress: jest.fn(),
      getEthereumAddress: jest.fn(),
    } as any;

    (HardwareWalletService.getInstance as jest.Mock).mockReturnValue(mockHardwareWalletService);

    (getHardwareWallets as jest.Mock).mockResolvedValue([]);
    (saveHardwareWallets as jest.Mock).mockResolvedValue(undefined);
    (validateChainName as jest.Mock).mockReturnValue(true);

    // Setup Solana and Ethereum static method mocks
    (Solana.validateAddress as jest.Mock).mockImplementation((address) => address);
    (Ethereum.validateAddress as jest.Mock).mockImplementation((address) => address);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /wallet/hardware/add', () => {
    it('should add a Solana hardware wallet by finding the address', async () => {
      const mockAddress = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

      (Solana.validateAddress as jest.Mock).mockReturnValue(mockAddress);

      // Mock finding the address at account index 2
      mockHardwareWalletService.getSolanaAddress
        .mockResolvedValueOnce({
          address: 'differentAddress1',
          publicKey: 'differentAddress1',
          derivationPath: "44'/501'/0'",
          chain: 'solana',
          addedAt: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          address: 'differentAddress2',
          publicKey: 'differentAddress2',
          derivationPath: "44'/501'/1'",
          chain: 'solana',
          addedAt: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          address: mockAddress,
          publicKey: mockAddress,
          derivationPath: "44'/501'/2'",
          chain: 'solana',
          addedAt: new Date().toISOString(),
        });

      const response = await app.inject({
        method: 'POST',
        url: '/hardware/add',
        body: {
          chain: 'solana',
          address: mockAddress,
          accountIndex: 0,
          name: 'My Ledger',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.address).toBe(mockAddress);
      expect(result.message).toContain('added successfully');
      expect(mockHardwareWalletService.getSolanaAddress).toHaveBeenCalledTimes(3);
    });

    it('should fail if address not found on device', async () => {
      const mockAddress = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

      (Solana.validateAddress as jest.Mock).mockReturnValue(mockAddress);

      // Mock not finding the address - always return different address
      mockHardwareWalletService.getSolanaAddress.mockResolvedValue({
        address: 'differentAddress',
        publicKey: 'differentAddress',
        derivationPath: "44'/501'/0'",
        chain: 'solana',
        addedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/hardware/add',
        body: {
          chain: 'solana',
          address: mockAddress,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.body);
      expect(result.message).toContain('not found on Ledger device');
    });

    it('should fail if no device connected', async () => {
      mockHardwareWalletService.isDeviceConnected.mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/hardware/add',
        body: {
          chain: 'solana',
          address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('No Ledger device found');
    });
  });

  describe('DELETE /wallet/hardware/remove', () => {
    it('should remove a hardware wallet', async () => {
      const mockAddress = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

      (Solana.validateAddress as jest.Mock).mockReturnValue(mockAddress);
      (getHardwareWallets as jest.Mock).mockResolvedValue([
        {
          address: mockAddress,
          publicKey: mockAddress,
          derivationPath: "44'/501'/0'",
          addedAt: new Date().toISOString(),
        },
      ]);

      const response = await app.inject({
        method: 'DELETE',
        url: '/hardware/remove',
        body: {
          chain: 'solana',
          address: mockAddress,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.message).toContain('removed successfully');
      expect(saveHardwareWallets).toHaveBeenCalledWith('solana', []);
    });

    it('should fail if wallet not found', async () => {
      const mockAddress = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

      (Solana.validateAddress as jest.Mock).mockReturnValue(mockAddress);
      (getHardwareWallets as jest.Mock).mockResolvedValue([]);

      const response = await app.inject({
        method: 'DELETE',
        url: '/hardware/remove',
        body: {
          chain: 'solana',
          address: mockAddress,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('not found');
    });
  });

  describe('GET /wallet/hardware', () => {
    it('should list hardware wallets', async () => {
      const mockWallets = [
        {
          address: 'address1',
          publicKey: 'address1',
          derivationPath: "44'/501'/0'",
          name: 'Ledger 1',
          addedAt: new Date().toISOString(),
        },
        {
          address: 'address2',
          publicKey: 'address2',
          derivationPath: "44'/501'/1'",
          name: 'Ledger 2',
          addedAt: new Date().toISOString(),
        },
      ];

      (getHardwareWallets as jest.Mock).mockResolvedValue(mockWallets);

      const response = await app.inject({
        method: 'GET',
        url: '/hardware?chain=solana',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.chain).toBe('solana');
      expect(result.wallets).toHaveLength(2);
      expect(result.wallets[0].name).toBe('Ledger 1');
    });

    it('should fail with invalid chain', async () => {
      (validateChainName as jest.Mock).mockReturnValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/hardware?chain=invalid',
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Unrecognized chain name');
    });
  });
});

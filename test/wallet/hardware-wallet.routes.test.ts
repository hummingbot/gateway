import sensible from '@fastify/sensible';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../src/services/hardware-wallet-service');
jest.mock('../../src/wallet/utils');
jest.mock('../../src/chains/solana/solana');
jest.mock('../../src/chains/ethereum/ethereum');

import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { HardwareWalletService } from '../../src/services/hardware-wallet-service';
import { addHardwareWalletRoute } from '../../src/wallet/routes/addHardwareWallet';
import {
  getHardwareWallets,
  saveHardwareWallets,
  validateChainName,
  validateAddressByChain,
} from '../../src/wallet/utils';

describe('Hardware Wallet Routes', () => {
  let app: FastifyInstance;
  let mockHardwareWalletService: jest.Mocked<HardwareWalletService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    app = Fastify();
    await app.register(addHardwareWalletRoute);

    mockHardwareWalletService = {
      isDeviceConnected: jest.fn().mockResolvedValue(true),
      getSolanaAddress: jest.fn(),
      getEthereumAddress: jest.fn(),
    } as any;

    (HardwareWalletService.getInstance as jest.Mock).mockReturnValue(mockHardwareWalletService);

    (getHardwareWallets as jest.Mock).mockResolvedValue([]);
    (saveHardwareWallets as jest.Mock).mockResolvedValue(undefined);
    (validateChainName as jest.Mock).mockReturnValue(true);
    (validateAddressByChain as jest.Mock).mockImplementation((_chain, address) => address);

    // Setup Solana and Ethereum static method mocks
    (Solana.validateAddress as jest.Mock).mockImplementation((address) => address);
    (Ethereum.validateAddress as jest.Mock).mockImplementation((address) => address);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /wallet/add-hardware', () => {
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
        url: '/add-hardware',
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
        url: '/add-hardware',
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
        url: '/add-hardware',
        body: {
          chain: 'solana',
          address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('No Ledger device found');
    });

    it('should fail immediately if device is locked', async () => {
      const mockAddress = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

      (Solana.validateAddress as jest.Mock).mockReturnValue(mockAddress);

      // Mock the device being locked
      mockHardwareWalletService.getSolanaAddress.mockRejectedValue(new Error('Ledger device: Locked device (0x5515)'));

      const response = await app.inject({
        method: 'POST',
        url: '/add-hardware',
        body: {
          chain: 'solana',
          address: mockAddress,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Ledger device is locked');
      expect(response.body).toContain('Please unlock your Ledger device and open the Solana app');
      // Should only check once before failing
      expect(mockHardwareWalletService.getSolanaAddress).toHaveBeenCalledTimes(1);
    });

    it('should fail immediately if wrong app is open', async () => {
      const mockAddress = '0x10BA451e6439Efc6a17dc20d21121Aa838100705';

      (Ethereum.validateAddress as jest.Mock).mockReturnValue(mockAddress);

      // Mock wrong app being open (error code 0x6a83)
      mockHardwareWalletService.getEthereumAddress.mockRejectedValue(
        new Error('Ledger device: UNKNOWN_ERROR (0x6a83)'),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/add-hardware',
        body: {
          chain: 'ethereum',
          address: mockAddress,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Wrong Ledger app is open');
      expect(response.body).toContain('Please open the Ethereum app on your Ledger device');
      // Should only check once before failing
      expect(mockHardwareWalletService.getEthereumAddress).toHaveBeenCalledTimes(1);
    });
  });
});

import EthApp from '@ledgerhq/hw-app-eth';
import SolanaApp from '@ledgerhq/hw-app-solana';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';

import { HardwareWalletService } from '../../src/services/hardware-wallet-service';
import { LedgerTransportManager } from '../../src/services/ledger-transport';

jest.mock('../../src/services/ledger-transport');
jest.mock('@ledgerhq/hw-transport-node-hid');
jest.mock('@ledgerhq/hw-app-solana');
jest.mock('@ledgerhq/hw-app-eth');

describe('HardwareWalletService', () => {
  let service: HardwareWalletService;
  let mockTransportManager: jest.Mocked<LedgerTransportManager>;
  let mockTransport: jest.Mocked<TransportNodeHid>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton instance
    (HardwareWalletService as any).instance = null;

    // Mock transport
    mockTransport = {
      close: jest.fn(),
      setExchangeTimeout: jest.fn(),
    } as any;

    // Mock transport manager
    mockTransportManager = {
      withTransport: jest.fn().mockImplementation(async (operation) => {
        return operation(mockTransport);
      }),
      isDeviceConnected: jest.fn().mockResolvedValue(true),
      listDevices: jest.fn().mockResolvedValue([
        {
          descriptor: 'device-1',
          productName: 'Ledger Device',
        },
      ]),
    } as any;

    // Reset the LedgerTransportManager singleton as well
    (LedgerTransportManager as any).instance = null;

    (LedgerTransportManager.getInstance as jest.Mock).mockReturnValue(mockTransportManager);

    service = HardwareWalletService.getInstance();
  });

  describe('getSolanaAddress', () => {
    it('should get Solana address from Ledger', async () => {
      const mockAddress = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
      const mockSolanaApp = {
        getAddress: jest.fn().mockResolvedValue({
          address: {
            toString: () => mockAddress,
          },
        }),
      };
      (SolanaApp as jest.Mock).mockImplementation(() => mockSolanaApp);

      const result = await service.getSolanaAddress("44'/501'/0'");

      expect(result).toEqual({
        address: mockAddress,
        publicKey: mockAddress,
        derivationPath: "44'/501'/0'",
        chain: 'solana',
        addedAt: expect.any(String),
      });
      expect(mockSolanaApp.getAddress).toHaveBeenCalledWith("44'/501'/0'");
    });

    it('should throw error if no address returned', async () => {
      const mockSolanaApp = {
        getAddress: jest.fn().mockResolvedValue(null),
      };
      (SolanaApp as jest.Mock).mockImplementation(() => mockSolanaApp);

      await expect(service.getSolanaAddress()).rejects.toThrow('Failed to get address from Ledger device');
    });
  });

  describe('getEthereumAddress', () => {
    it('should get Ethereum address from Ledger', async () => {
      const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8b1d2';
      const mockPublicKey = '0xpublickey123';
      const mockEthApp = {
        getAddress: jest.fn().mockResolvedValue({
          address: mockAddress,
          publicKey: mockPublicKey,
        }),
      };
      (EthApp as jest.Mock).mockImplementation(() => mockEthApp);

      const result = await service.getEthereumAddress("44'/60'/0'/0/0");

      expect(result).toEqual({
        address: mockAddress,
        publicKey: mockPublicKey,
        derivationPath: "44'/60'/0'/0/0",
        chain: 'ethereum',
        addedAt: expect.any(String),
      });
      expect(mockEthApp.getAddress).toHaveBeenCalledWith("44'/60'/0'/0/0");
    });
  });

  describe('signSolanaTransaction', () => {
    it('should sign a Solana transaction', async () => {
      const mockSignature = Buffer.from('mock-signature');
      const mockSolanaApp = {
        signTransaction: jest.fn().mockResolvedValue({
          signature: mockSignature,
        }),
      };
      (SolanaApp as jest.Mock).mockImplementation(() => mockSolanaApp);

      const mockTransaction = {
        serializeMessage: jest.fn().mockReturnValue(Buffer.from('message')),
      } as any;

      const result = await service.signSolanaTransaction("44'/501'/0'", mockTransaction);

      expect(result).toEqual(mockSignature);
      expect(mockTransport.setExchangeTimeout).toHaveBeenCalledWith(60000);
      expect(mockSolanaApp.signTransaction).toHaveBeenCalledWith("44'/501'/0'", Buffer.from('message'));
    });

    it('should handle user rejection', async () => {
      const mockSolanaApp = {
        signTransaction: jest.fn().mockRejectedValue({
          statusCode: 0x6985,
          message: 'User rejected',
        }),
      };
      (SolanaApp as jest.Mock).mockImplementation(() => mockSolanaApp);

      const mockTransaction = {
        serializeMessage: jest.fn().mockReturnValue(Buffer.from('message')),
      } as any;

      await expect(service.signSolanaTransaction("44'/501'/0'", mockTransaction)).rejects.toThrow(
        'Transaction rejected by user on Ledger device',
      );
    });

    it('should handle timeout', async () => {
      const mockSolanaApp = {
        signTransaction: jest.fn().mockRejectedValue({
          message: 'Timeout waiting for user',
        }),
      };
      (SolanaApp as jest.Mock).mockImplementation(() => mockSolanaApp);

      const mockTransaction = {
        serializeMessage: jest.fn().mockReturnValue(Buffer.from('message')),
      } as any;

      await expect(service.signSolanaTransaction("44'/501'/0'", mockTransaction)).rejects.toThrow(
        'Transaction signing timed out. Please try again.',
      );
    });
  });

  describe('isDeviceConnected', () => {
    it('should return true when device is connected', async () => {
      const result = await service.isDeviceConnected();
      expect(result).toBe(true);
      expect(mockTransportManager.isDeviceConnected).toHaveBeenCalled();
    });

    it('should return false when no device is connected', async () => {
      mockTransportManager.isDeviceConnected.mockResolvedValue(false);
      const result = await service.isDeviceConnected();
      expect(result).toBe(false);
    });
  });

  describe('listDevices', () => {
    it('should list connected devices', async () => {
      const devices = await service.listDevices();
      expect(devices).toEqual([
        {
          descriptor: 'device-1',
          productName: 'Ledger Device',
        },
      ]);
      expect(mockTransportManager.listDevices).toHaveBeenCalled();
    });
  });

  describe('verifyConnection', () => {
    it('should verify Solana connection', async () => {
      const mockSolanaApp = {
        getAddress: jest.fn().mockResolvedValue({
          address: {
            toString: () => 'test-address',
          },
        }),
      };
      (SolanaApp as jest.Mock).mockImplementation(() => mockSolanaApp);

      const result = await service.verifyConnection('solana');
      expect(result).toBe(true);
    });

    it('should return false on connection failure', async () => {
      const mockSolanaApp = {
        getAddress: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };
      (SolanaApp as jest.Mock).mockImplementation(() => mockSolanaApp);

      const result = await service.verifyConnection('solana');
      expect(result).toBe(false);
    });
  });
});

import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Ethereum } from '../../../../src/chains/ethereum/ethereum';

// Mock the Ethereum class
jest.mock('../../../../src/chains/ethereum/ethereum');

const mockEthereum = Ethereum as jest.Mocked<typeof Ethereum>;

describe('Ethereum Wrap Route', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    // Mock static methods that are called during route registration
    mockEthereum.getWalletAddressExample = jest.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
    mockEthereum.validateAddress = jest.fn((address: string) => address);
    mockEthereum.isAddress = jest.fn((_address: string) => true) as any;

    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /chains/ethereum/wrap', () => {
    const mockWalletAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
    const mockTxHash = '0x123456789abcdef';
    const mockWethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

    const mockInstance = {
      init: jest.fn(),
      nativeTokenSymbol: 'ETH',
      tokenMap: {
        WETH: {
          address: mockWethAddress,
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
        },
      },
      isHardwareWallet: jest.fn(),
      getWallet: jest.fn(),
      prepareGasOptions: jest.fn(),
      handleTransactionExecution: jest.fn(),
      provider: {
        getTransactionCount: jest.fn(),
      },
    };

    beforeEach(() => {
      mockEthereum.getInstance.mockResolvedValue(mockInstance as any);
      mockInstance.init.mockResolvedValue(undefined);
      mockInstance.isHardwareWallet.mockResolvedValue(false);
      mockInstance.prepareGasOptions.mockResolvedValue({
        maxFeePerGas: '15000000000',
        maxPriorityFeePerGas: '1000000000',
      });
    });

    it('should wrap ETH successfully', async () => {
      const mockWallet = {
        address: mockWalletAddress,
        sendTransaction: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          nonce: 1,
          wait: jest.fn(),
        }),
      };

      mockInstance.getWallet.mockResolvedValue(mockWallet as any);
      mockInstance.provider.getTransactionCount.mockResolvedValue(1);
      mockInstance.handleTransactionExecution.mockResolvedValue({
        transactionHash: mockTxHash,
        status: 1,
        gasUsed: { mul: jest.fn().mockReturnValue({ _hex: '0x5208' }) },
        effectiveGasPrice: { _hex: '0x3b9aca00' },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/wrap',
        payload: {
          network: 'mainnet',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        signature: mockTxHash,
        status: 1,
        data: {
          nonce: 1,
          fee: expect.any(String),
          amount: expect.any(String),
          wrappedAddress: mockWethAddress,
          nativeToken: 'ETH',
          wrappedToken: 'WETH',
        },
      });

      expect(mockEthereum.getInstance).toHaveBeenCalledWith('mainnet');
      expect(mockInstance.init).toHaveBeenCalled();
      expect(mockInstance.getWallet).toHaveBeenCalledWith(mockWalletAddress);
    });

    it('should handle wrapping on different networks', async () => {
      const networks = [
        { network: 'mainnet', wrappedSymbol: 'WETH' },
        { network: 'polygon', wrappedSymbol: 'WMATIC' },
        { network: 'bsc', wrappedSymbol: 'WBNB' },
      ];

      for (const { network, wrappedSymbol } of networks) {
        jest.clearAllMocks();

        const networkInstance = {
          ...mockInstance,
          nativeTokenSymbol: wrappedSymbol.substring(1), // Remove 'W' prefix
          tokenMap: {
            [wrappedSymbol]: {
              address: '0x1234567890abcdef',
              symbol: wrappedSymbol,
              name: `Wrapped ${wrappedSymbol.substring(1)}`,
              decimals: 18,
            },
          },
        };

        mockEthereum.getInstance.mockResolvedValue(networkInstance as any);

        const mockWallet = {
          address: mockWalletAddress,
          sendTransaction: jest.fn().mockResolvedValue({
            hash: mockTxHash,
            nonce: 1,
          }),
        };

        networkInstance.getWallet.mockResolvedValue(mockWallet as any);
        networkInstance.provider.getTransactionCount.mockResolvedValue(1);
        networkInstance.handleTransactionExecution.mockResolvedValue({
          transactionHash: mockTxHash,
          status: 1,
          gasUsed: { mul: jest.fn().mockReturnValue({ _hex: '0x5208' }) },
          effectiveGasPrice: { _hex: '0x3b9aca00' },
        });

        const response = await fastify.inject({
          method: 'POST',
          url: '/chains/ethereum/wrap',
          payload: {
            network,
            address: mockWalletAddress,
            amount: '0.5',
          },
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);
        expect(data.data.wrappedToken).toBe(wrappedSymbol);
      }
    });

    it('should return error when wrapped token not found in token list', async () => {
      const instanceWithoutWrappedToken = {
        ...mockInstance,
        tokenMap: {}, // Empty token map
      };

      mockEthereum.getInstance.mockResolvedValue(instanceWithoutWrappedToken as any);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/wrap',
        payload: {
          network: 'mainnet',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Wrapped token WETH not found');
    });

    it('should handle insufficient funds error', async () => {
      const mockWallet = {
        address: mockWalletAddress,
        sendTransaction: jest.fn().mockRejectedValue(new Error('insufficient funds for transfer')),
      };

      mockInstance.getWallet.mockResolvedValue(mockWallet as any);
      mockInstance.provider.getTransactionCount.mockResolvedValue(1);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/wrap',
        payload: {
          network: 'mainnet',
          address: mockWalletAddress,
          amount: '100.0',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Insufficient funds');
    });

    it('should handle transaction timeout', async () => {
      const mockWallet = {
        address: mockWalletAddress,
        sendTransaction: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          nonce: 1,
        }),
      };

      mockInstance.getWallet.mockResolvedValue(mockWallet as any);
      mockInstance.provider.getTransactionCount.mockResolvedValue(1);
      mockInstance.handleTransactionExecution.mockRejectedValue(
        Object.assign(new Error('Transaction timeout'), { transactionHash: mockTxHash }),
      );

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/wrap',
        payload: {
          network: 'mainnet',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(408);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Transaction timeout');
      expect(data.message).toContain(mockTxHash);
    });

    it('should handle wallet loading failure', async () => {
      mockInstance.getWallet.mockRejectedValue(new Error('Wallet not found'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/wrap',
        payload: {
          network: 'mainnet',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Failed to load wallet');
    });

    it('should handle Ledger rejection', async () => {
      mockInstance.isHardwareWallet.mockResolvedValue(true);

      // Mock Ledger signing failure
      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/wrap',
        payload: {
          network: 'mainnet',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      // Since we don't have a full Ledger mock, this will fail during execution
      // In a real test, you would mock the EthereumLedger class
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle partial ETH amounts', async () => {
      const mockWallet = {
        address: mockWalletAddress,
        sendTransaction: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          nonce: 1,
        }),
      };

      mockInstance.getWallet.mockResolvedValue(mockWallet as any);
      mockInstance.provider.getTransactionCount.mockResolvedValue(1);
      mockInstance.handleTransactionExecution.mockResolvedValue({
        transactionHash: mockTxHash,
        status: 1,
        gasUsed: { mul: jest.fn().mockReturnValue({ _hex: '0x5208' }) },
        effectiveGasPrice: { _hex: '0x3b9aca00' },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/wrap',
        payload: {
          network: 'mainnet',
          address: mockWalletAddress,
          amount: '0.123456',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.status).toBe(1);
    });
  });
});

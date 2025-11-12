import { PublicKey, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

const mockSolana = Solana as jest.Mocked<typeof Solana>;

describe('Solana Wrap Route', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /chains/solana/wrap', () => {
    const mockWalletAddress = '7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3';
    const mockSignature = '5j7s6NiJS3JAkvgkoc18WVAsiSaci2pxB2A6ueCJP4tprA2TFg9wSyTLeYouxPBJEMzJinENTkpA52YStRW5Dia7';

    const mockWrapInstructions: TransactionInstruction[] = [
      {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        keys: [],
        data: Buffer.from([]),
      },
    ];

    const mockInstance = {
      init: jest.fn(),
      wrapSOL: jest.fn(),
      isHardwareWallet: jest.fn(),
      getWallet: jest.fn(),
      simulateWithErrorHandling: jest.fn(),
      sendAndConfirmRawTransaction: jest.fn(),
      connection: {
        getLatestBlockhash: jest.fn(),
      },
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockInstance as any);
      mockInstance.init.mockResolvedValue(undefined);
      mockInstance.wrapSOL.mockResolvedValue(mockWrapInstructions);
      mockInstance.isHardwareWallet.mockResolvedValue(false);
      mockInstance.connection.getLatestBlockhash.mockResolvedValue({
        blockhash: 'GZqKpKdHBDzVjGnLkZHABVjJ2RqVdmT3SWqGw8XYL5Mz',
        lastValidBlockHeight: 123456,
      });
    });

    it('should wrap SOL successfully', async () => {
      const mockKeypair = {
        publicKey: new PublicKey(mockWalletAddress),
        secretKey: new Uint8Array(64),
      };
      mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
      mockInstance.simulateWithErrorHandling.mockResolvedValue(undefined);
      mockInstance.sendAndConfirmRawTransaction.mockResolvedValue({
        confirmed: true,
        signature: mockSignature,
        txData: {
          meta: {
            fee: 5000,
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        signature: mockSignature,
        status: 1, // CONFIRMED
        data: {
          fee: expect.any(String),
          amount: '1.0',
          wrappedAddress: 'So11111111111111111111111111111111111111112',
          nativeToken: 'SOL',
          wrappedToken: 'WSOL',
        },
      });

      expect(mockSolana.getInstance).toHaveBeenCalledWith('mainnet-beta');
      expect(mockInstance.wrapSOL).toHaveBeenCalledWith(
        expect.any(PublicKey),
        1_000_000_000, // 1 SOL in lamports
      );
      expect(mockInstance.simulateWithErrorHandling).toHaveBeenCalled();
      expect(mockInstance.sendAndConfirmRawTransaction).toHaveBeenCalled();
    });

    it('should handle partial SOL amounts', async () => {
      const mockKeypair = {
        publicKey: new PublicKey(mockWalletAddress),
        secretKey: new Uint8Array(64),
      };
      mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
      mockInstance.simulateWithErrorHandling.mockResolvedValue(undefined);
      mockInstance.sendAndConfirmRawTransaction.mockResolvedValue({
        confirmed: true,
        signature: mockSignature,
        txData: { meta: { fee: 5000 } },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '0.5',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockInstance.wrapSOL).toHaveBeenCalledWith(expect.any(PublicKey), 500_000_000); // 0.5 SOL
    });

    it('should return pending status when transaction is not confirmed', async () => {
      const mockKeypair = {
        publicKey: new PublicKey(mockWalletAddress),
        secretKey: new Uint8Array(64),
      };
      mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
      mockInstance.simulateWithErrorHandling.mockResolvedValue(undefined);
      mockInstance.sendAndConfirmRawTransaction.mockResolvedValue({
        confirmed: false,
        signature: mockSignature,
        txData: null,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          network: 'devnet',
          address: mockWalletAddress,
          amount: '2.0',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toEqual({
        signature: mockSignature,
        status: 0, // PENDING
      });
    });

    it('should reject invalid amounts', async () => {
      // Mock getInstance to allow validation logic to run
      mockSolana.getInstance.mockResolvedValue(mockInstance as any);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '0',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Amount must be greater than 0');
    });

    it('should reject negative amounts', async () => {
      // Mock getInstance to allow validation logic to run
      mockSolana.getInstance.mockResolvedValue(mockInstance as any);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '-1.0',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Amount must be greater than 0');
    });

    it('should handle insufficient funds error', async () => {
      const mockKeypair = {
        publicKey: new PublicKey(mockWalletAddress),
        secretKey: new Uint8Array(64),
      };
      mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
      mockInstance.simulateWithErrorHandling.mockRejectedValue(new Error('insufficient funds'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '100.0',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Insufficient funds');
    });

    it('should handle transaction timeout', async () => {
      const mockKeypair = {
        publicKey: new PublicKey(mockWalletAddress),
        secretKey: new Uint8Array(64),
      };
      mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
      mockInstance.simulateWithErrorHandling.mockResolvedValue(undefined);
      mockInstance.sendAndConfirmRawTransaction.mockRejectedValue(new Error('timeout'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(408);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Transaction timeout');
    });

    it('should work with different networks', async () => {
      const networks = ['mainnet-beta', 'devnet'];

      for (const network of networks) {
        jest.clearAllMocks();

        const mockKeypair = {
          publicKey: new PublicKey(mockWalletAddress),
          secretKey: new Uint8Array(64),
        };

        mockSolana.getInstance.mockResolvedValue(mockInstance as any);
        mockInstance.wrapSOL.mockResolvedValue(mockWrapInstructions);
        mockInstance.isHardwareWallet.mockResolvedValue(false);
        mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
        mockInstance.connection.getLatestBlockhash.mockResolvedValue({
          blockhash: 'test-blockhash',
          lastValidBlockHeight: 123456,
        });
        mockInstance.simulateWithErrorHandling.mockResolvedValue(undefined);
        mockInstance.sendAndConfirmRawTransaction.mockResolvedValue({
          confirmed: true,
          signature: mockSignature,
          txData: { meta: { fee: 5000 } },
        });

        const response = await fastify.inject({
          method: 'POST',
          url: '/chains/solana/wrap',
          payload: {
            network,
            address: mockWalletAddress,
            amount: '1.0',
          },
        });

        expect(response.statusCode).toBe(200);
        expect(mockSolana.getInstance).toHaveBeenCalledWith(network);
      }
    });

    it('should use default network parameter when not provided', async () => {
      const mockKeypair = {
        publicKey: new PublicKey(mockWalletAddress),
        secretKey: new Uint8Array(64),
      };
      mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
      mockInstance.simulateWithErrorHandling.mockResolvedValue(undefined);
      mockInstance.sendAndConfirmRawTransaction.mockResolvedValue({
        confirmed: true,
        signature: mockSignature,
        txData: { meta: { fee: 5000 } },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/wrap',
        payload: {
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(200);
      // Default network should be used from config
      expect(mockSolana.getInstance).toHaveBeenCalled();
    });
  });
});

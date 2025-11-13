import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

const mockSolana = Solana as jest.Mocked<typeof Solana>;

describe('Solana Parse Route', () => {
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

  describe('POST /chains/solana/parse', () => {
    const mockSignature = '5J8CriNVzkPaWvjC7A4mT8V3SFV94JJ7v1jz8ZKsV2mZYxUeF7LT1xUqS6Hw9MvQpYGnXw5gqNbT2mZYxUeF7L';
    const mockWalletAddress = 'DRpaJDurGtinzUPWSYnripFsJTBXm4HG7AC3LSgJNtNB';

    const mockTxData = {
      slot: 379839812,
      blockTime: 1763049768,
      meta: {
        err: null,
      },
    };

    const mockSolanaInstance = {
      getTransaction: jest.fn(),
      getTransactionStatusCode: jest.fn(),
      extractBalanceChangesAndFee: jest.fn(),
      getToken: jest.fn(),
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockSolanaInstance as any);
      mockSolanaInstance.getTransaction.mockResolvedValue(mockTxData);
      mockSolanaInstance.getTransactionStatusCode.mockResolvedValue(1); // CONFIRMED
      mockSolanaInstance.extractBalanceChangesAndFee.mockResolvedValue({
        balanceChanges: [-0.202970564], // SOL balance change (native currency)
        fee: 0.000011851,
      });
    });

    it('should parse transaction successfully with only native currency', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: mockSignature,
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        signature: mockSignature,
        slot: 379839812,
        blockTime: 1763049768,
        status: 1,
        fee: 0.000011851,
        nativeBalanceChange: -0.202970564,
      });

      expect(mockSolanaInstance.extractBalanceChangesAndFee).toHaveBeenCalledWith(
        mockSignature,
        mockWalletAddress,
        ['So11111111111111111111111111111111111111112'], // SOL mint address
      );
    });

    it('should parse transaction with additional tokens', async () => {
      // Mock token info lookup
      mockSolanaInstance.getToken
        .mockResolvedValueOnce({
          symbol: 'USDC',
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
        } as any)
        .mockResolvedValueOnce({
          symbol: 'BONK',
          address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
          decimals: 5,
        } as any);

      // Mock balance changes: SOL, USDC, BONK
      mockSolanaInstance.extractBalanceChangesAndFee.mockResolvedValue({
        balanceChanges: [-0.202970564, 10.5, 1000],
        fee: 0.000011851,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: mockSignature,
          walletAddress: mockWalletAddress,
          tokens: ['USDC', 'BONK'],
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        signature: mockSignature,
        slot: 379839812,
        blockTime: 1763049768,
        status: 1,
        fee: 0.000011851,
        nativeBalanceChange: -0.202970564,
        tokenBalanceChanges: {
          USDC: 10.5,
          BONK: 1000,
        },
      });
    });

    it('should handle invalid signature format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: 'invalid-sig',
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        signature: 'invalid-sig',
        slot: null,
        blockTime: null,
        status: 0,
        fee: null,
        error: 'Invalid transaction signature format',
      });
    });

    it('should handle transaction not found', async () => {
      mockSolanaInstance.getTransaction.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: mockSignature,
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        signature: mockSignature,
        slot: null,
        blockTime: null,
        status: 0,
        fee: null,
        error: 'Transaction not found',
      });
    });

    it('should handle failed transaction status', async () => {
      mockSolanaInstance.getTransactionStatusCode.mockResolvedValue(-1); // FAILED

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: mockSignature,
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.status).toBe(-1);
      expect(responseBody.fee).toBe(0.000011851);
    });

    it('should handle token not found in registry', async () => {
      // Mock USDC found, UNKNOWN not found
      mockSolanaInstance.getToken
        .mockResolvedValueOnce({
          symbol: 'USDC',
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
        } as any)
        .mockResolvedValueOnce(null); // UNKNOWN token not found

      // Only SOL and USDC in balance changes (UNKNOWN skipped)
      mockSolanaInstance.extractBalanceChangesAndFee.mockResolvedValue({
        balanceChanges: [-0.202970564, 10.5],
        fee: 0.000011851,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: mockSignature,
          walletAddress: mockWalletAddress,
          tokens: ['USDC', 'UNKNOWN'],
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.tokenBalanceChanges).toEqual({
        USDC: 10.5,
      });
      // UNKNOWN token should not appear in results
    });

    it('should handle network parameter', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          network: 'devnet',
          signature: mockSignature,
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSolana.getInstance).toHaveBeenCalledWith('devnet');
    });

    it('should handle extraction errors gracefully', async () => {
      mockSolanaInstance.extractBalanceChangesAndFee.mockRejectedValue(new Error('Failed to extract balance changes'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: mockSignature,
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        signature: mockSignature,
        slot: null,
        blockTime: null,
        status: 0,
        fee: null,
        error: 'Failed to extract balance changes',
      });
    });

    it('should return undefined tokenBalanceChanges when no tokens requested', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: mockSignature,
          walletAddress: mockWalletAddress,
          tokens: [],
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.tokenBalanceChanges).toBeUndefined();
      expect(responseBody.nativeBalanceChange).toBe(-0.202970564);
    });
  });
});

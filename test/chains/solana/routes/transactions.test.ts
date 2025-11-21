import { PublicKey } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

const mockSolana = Solana as jest.Mocked<typeof Solana>;

describe('Solana Transactions Route', () => {
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

  describe('GET /chains/solana/transactions', () => {
    const mockWalletAddress = 'DRpaJDurGtinzUPWSYnripFsJTBXm4HG7AC3LSgJNtNB';
    const mockSignatures = [
      {
        signature: '5J8CriNVzkPaWvjC7A4mT8V3SFV94JJ7v1jz8ZKsV2mZYxUeF7LT1xUqS6Hw9MvQpYGnXw5gqNbT2mZYxUeF7L',
        slot: 379839812,
        blockTime: 1763049768,
        err: null,
        memo: null,
        confirmationStatus: 'finalized',
      },
      {
        signature: '3K9CriNVzkPaWvjC7A4mT8V3SFV94JJ7v1jz8ZKsV2mZYxUeF7LT1xUqS6Hw9MvQpYGnXw5gqNbT2mZYxUeF7L',
        slot: 379839800,
        blockTime: 1763049750,
        err: null,
        memo: 'test memo',
        confirmationStatus: 'finalized',
      },
    ];

    const mockConnection = {
      getSignaturesForAddress: jest.fn(),
    };

    const mockSolanaInstance = {
      getCurrentBlockNumber: jest.fn(),
      connection: mockConnection,
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockSolanaInstance as any);
      mockSolanaInstance.getCurrentBlockNumber.mockResolvedValue(379894381);
      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures as any);
    });

    it('should fetch transaction signatures successfully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/chains/solana/transactions?walletAddress=${mockWalletAddress}&limit=2`,
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        currentBlock: 379894381,
        transactions: mockSignatures,
        count: 2,
      });

      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledWith(
        expect.any(PublicKey),
        expect.objectContaining({ limit: 2 }),
      );
    });

    it('should use default limit of 100 when not specified', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/chains/solana/transactions?walletAddress=${mockWalletAddress}`,
      });

      expect(response.statusCode).toBe(200);

      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledWith(
        expect.any(PublicKey),
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('should handle limit parameter correctly', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/chains/solana/transactions?walletAddress=${mockWalletAddress}&limit=5`,
      });

      expect(response.statusCode).toBe(200);

      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledWith(
        expect.any(PublicKey),
        expect.objectContaining({ limit: 5 }),
      );
    });

    it('should return empty transactions array when no signatures found', async () => {
      mockConnection.getSignaturesForAddress.mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: `/chains/solana/transactions?walletAddress=${mockWalletAddress}&limit=10`,
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        currentBlock: 379894381,
        transactions: [],
        count: 0,
      });
    });

    it('should handle invalid wallet address', async () => {
      mockConnection.getSignaturesForAddress.mockRejectedValue(new Error('Invalid public key input'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/transactions?walletAddress=invalid-address&limit=10',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toMatch(/An unexpected error occurred|Failed to fetch transactions/);
    });

    it('should respect maximum limit of 100', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/chains/solana/transactions?walletAddress=${mockWalletAddress}&limit=100`,
      });

      expect(response.statusCode).toBe(200);

      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledWith(
        expect.any(PublicKey),
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('should handle network parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/chains/solana/transactions?network=devnet&walletAddress=${mockWalletAddress}&limit=5`,
      });

      expect(response.statusCode).toBe(200);
      expect(mockSolana.getInstance).toHaveBeenCalledWith('devnet');
    });

    it('should include transaction with error in results', async () => {
      const signaturesWithError = [
        {
          signature: '5J8CriNVzkPaWvjC7A4mT8V3SFV94JJ7v1jz8ZKsV2mZYxUeF7LT1xUqS6Hw9MvQpYGnXw5gqNbT2mZYxUeF7L',
          slot: 379839812,
          blockTime: 1763049768,
          err: { InstructionError: [0, 'Custom error message'] },
          memo: null,
          confirmationStatus: 'finalized',
        },
      ];

      mockConnection.getSignaturesForAddress.mockResolvedValue(signaturesWithError as any);

      const response = await fastify.inject({
        method: 'GET',
        url: `/chains/solana/transactions?walletAddress=${mockWalletAddress}&limit=1`,
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.transactions[0].err).toEqual({ InstructionError: [0, 'Custom error message'] });
    });
  });
});

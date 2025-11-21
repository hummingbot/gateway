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
      transaction: {
        message: {
          accountKeys: [],
          compiledInstructions: [],
        },
      },
      meta: {
        err: null,
        fee: 5000, // 0.000005 SOL in lamports
        preBalances: [1000000000], // 1 SOL
        postBalances: [800000000], // 0.8 SOL (net change: -0.2 SOL)
        preTokenBalances: [],
        postTokenBalances: [],
      },
    };

    const mockSolanaInstance = {
      getTransaction: jest.fn(),
      getTransactionStatusCode: jest.fn(),
      getToken: jest.fn(),
      config: {
        nativeCurrencySymbol: 'SOL',
      },
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockSolanaInstance as any);
      mockSolanaInstance.getTransaction.mockResolvedValue(mockTxData);
      mockSolanaInstance.getTransactionStatusCode.mockResolvedValue(1); // CONFIRMED
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
        fee: 0.000005,
        tokenBalanceChanges: {
          SOL: -0.2, // postBalance - preBalance = 0.8 - 1.0 = -0.2
        },
      });
    });

    it('should parse transaction with SPL token transfers', async () => {
      const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const bonkMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

      // Mock transaction with token balance changes
      const txDataWithTokens = {
        ...mockTxData,
        meta: {
          ...mockTxData.meta,
          preTokenBalances: [
            {
              accountIndex: 2,
              mint: usdcMint,
              owner: mockWalletAddress,
              uiTokenAmount: { uiAmount: 100 },
            },
            {
              accountIndex: 3,
              mint: bonkMint,
              owner: mockWalletAddress,
              uiTokenAmount: { uiAmount: 5000 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: usdcMint,
              owner: mockWalletAddress,
              uiTokenAmount: { uiAmount: 110.5 },
            },
            {
              accountIndex: 3,
              mint: bonkMint,
              owner: mockWalletAddress,
              uiTokenAmount: { uiAmount: 6000 },
            },
          ],
        },
      };

      mockSolanaInstance.getTransaction.mockResolvedValue(txDataWithTokens);
      mockSolanaInstance.getToken
        .mockResolvedValueOnce({
          symbol: 'USDC',
          address: usdcMint,
          decimals: 6,
        } as any)
        .mockResolvedValueOnce({
          symbol: 'BONK',
          address: bonkMint,
          decimals: 5,
        } as any);

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
        fee: 0.000005,
        tokenBalanceChanges: {
          SOL: -0.2,
          USDC: 10.5, // 110.5 - 100 = 10.5
          BONK: 1000, // 6000 - 5000 = 1000
        },
      });
    });

    it('should use mint address for unknown tokens', async () => {
      const unknownMint = 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp';

      const txDataWithUnknownToken = {
        ...mockTxData,
        meta: {
          ...mockTxData.meta,
          preTokenBalances: [
            {
              accountIndex: 2,
              mint: unknownMint,
              owner: mockWalletAddress,
              uiTokenAmount: { uiAmount: 100 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: unknownMint,
              owner: mockWalletAddress,
              uiTokenAmount: { uiAmount: 150 },
            },
          ],
        },
      };

      mockSolanaInstance.getTransaction.mockResolvedValue(txDataWithUnknownToken);
      mockSolanaInstance.getToken.mockResolvedValue(null); // Token not in list

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
      expect(responseBody.tokenBalanceChanges).toEqual({
        SOL: -0.2,
        [unknownMint]: 50, // Use mint address as identifier
      });
    });

    it('should detect Jupiter connector', async () => {
      const jupiterProgramId = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

      const txDataWithJupiter = {
        ...mockTxData,
        transaction: {
          message: {
            accountKeys: [{ toString: () => 'account1' }, { toString: () => jupiterProgramId }],
            compiledInstructions: [{ programIdIndex: 1 }],
          },
        },
      };

      mockSolanaInstance.getTransaction.mockResolvedValue(txDataWithJupiter);

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
      expect(responseBody.connector).toBe('jupiter/router');
    });

    it('should handle invalid signature format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/parse',
        payload: {
          signature: 'invalid-sig!@#',
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        signature: 'invalid-sig!@#',
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
      expect(responseBody.fee).toBe(0.000005);
      expect(responseBody.tokenBalanceChanges).toEqual({
        SOL: -0.2,
      });
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

    it('should handle errors gracefully', async () => {
      mockSolanaInstance.getTransaction.mockRejectedValue(new Error('Network error'));

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
        error: 'Network error',
      });
    });
  });
});

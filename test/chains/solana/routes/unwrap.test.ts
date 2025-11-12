import { AccountLayout } from '@solana/spl-token';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

const mockSolana = Solana as jest.Mocked<typeof Solana>;

describe('Solana Unwrap Route', () => {
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

  describe('POST /chains/solana/unwrap', () => {
    const mockWalletAddress = '7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3';
    const mockSignature = '5j7s6NiJS3JAkvgkoc18WVAsiSaci2pxB2A6ueCJP4tprA2TFg9wSyTLeYouxPBJEMzJinENTkpA52YStRW5Dia7';

    const mockUnwrapInstruction: TransactionInstruction = {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      keys: [],
      data: Buffer.from([]),
    };

    // Create mock account data with WSOL balance
    const createMockAccountData = (lamports: number) => {
      const accountData = Buffer.alloc(165); // SPL Token account size
      const uint8Array = new Uint8Array(accountData);
      AccountLayout.encode(
        {
          mint: new PublicKey('So11111111111111111111111111111111111111112'),
          owner: new PublicKey(mockWalletAddress),
          amount: BigInt(lamports),
          delegateOption: 0,
          delegate: PublicKey.default,
          state: 1,
          isNativeOption: 1,
          isNative: BigInt(lamports),
          delegatedAmount: BigInt(0),
          closeAuthorityOption: 0,
          closeAuthority: PublicKey.default,
        },
        uint8Array,
      );
      return accountData;
    };

    const mockInstance = {
      init: jest.fn(),
      unwrapSOL: jest.fn(),
      isHardwareWallet: jest.fn(),
      getWallet: jest.fn(),
      simulateWithErrorHandling: jest.fn(),
      sendAndConfirmRawTransaction: jest.fn(),
      connection: {
        getLatestBlockhash: jest.fn(),
        getAccountInfo: jest.fn(),
      },
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockInstance as any);
      mockInstance.init.mockResolvedValue(undefined);
      mockInstance.unwrapSOL.mockReturnValue(mockUnwrapInstruction);
      mockInstance.isHardwareWallet.mockResolvedValue(false);
      mockInstance.connection.getLatestBlockhash.mockResolvedValue({
        blockhash: 'GZqKpKdHBDzVjGnLkZHABVjJ2RqVdmT3SWqGw8XYL5Mz',
        lastValidBlockHeight: 123456,
      });
    });

    it('should unwrap all WSOL successfully when amount not specified', async () => {
      const wsolBalance = 1_000_000_000; // 1 SOL
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(wsolBalance),
        executable: false,
        lamports: wsolBalance,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

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
        url: '/chains/solana/unwrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        signature: mockSignature,
        status: 1, // CONFIRMED
        data: {
          fee: expect.any(String),
          amount: '1', // 1 SOL unwrapped
          wrappedAddress: 'So11111111111111111111111111111111111111112',
          nativeToken: 'SOL',
          wrappedToken: 'WSOL',
        },
      });

      expect(mockSolana.getInstance).toHaveBeenCalledWith('mainnet-beta');
      expect(mockInstance.unwrapSOL).toHaveBeenCalledWith(expect.any(PublicKey), expect.anything());
      expect(mockInstance.simulateWithErrorHandling).toHaveBeenCalled();
      expect(mockInstance.sendAndConfirmRawTransaction).toHaveBeenCalled();
    });

    it('should unwrap specified amount of WSOL', async () => {
      const wsolBalance = 2_000_000_000; // 2 SOL
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(wsolBalance),
        executable: false,
        lamports: wsolBalance,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

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
        url: '/chains/solana/unwrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '1.0',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Note: unwrap always closes entire account, so it unwraps all 2 SOL
      expect(data.data.amount).toBe('2');
    });

    it('should return error when WSOL account does not exist', async () => {
      mockInstance.connection.getAccountInfo.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/unwrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('No WSOL token account found');
    });

    it('should return error when WSOL balance is zero', async () => {
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(0), // Zero balance
        executable: false,
        lamports: 0,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/unwrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('WSOL balance is zero');
    });

    it('should return error when requested amount exceeds balance', async () => {
      const wsolBalance = 500_000_000; // 0.5 SOL
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(wsolBalance),
        executable: false,
        lamports: wsolBalance,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/unwrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
          amount: '1.0', // Requesting more than available
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Insufficient WSOL balance');
    });

    it('should reject invalid amounts', async () => {
      // Mock account with balance so validation can run
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(1_000_000_000),
        executable: false,
        lamports: 1_000_000_000,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/unwrap',
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
      // Mock account with balance so validation can run
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(1_000_000_000),
        executable: false,
        lamports: 1_000_000_000,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/unwrap',
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

    it('should return pending status when transaction is not confirmed', async () => {
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(1_000_000_000),
        executable: false,
        lamports: 1_000_000_000,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

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
        url: '/chains/solana/unwrap',
        payload: {
          network: 'devnet',
          address: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toEqual({
        signature: mockSignature,
        status: 0, // PENDING
      });
    });

    it('should handle transaction timeout', async () => {
      mockInstance.connection.getAccountInfo.mockResolvedValue({
        data: createMockAccountData(1_000_000_000),
        executable: false,
        lamports: 1_000_000_000,
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const mockKeypair = {
        publicKey: new PublicKey(mockWalletAddress),
        secretKey: new Uint8Array(64),
      };
      mockInstance.getWallet.mockResolvedValue(mockKeypair as any);
      mockInstance.simulateWithErrorHandling.mockResolvedValue(undefined);
      mockInstance.sendAndConfirmRawTransaction.mockRejectedValue(new Error('timeout'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/unwrap',
        payload: {
          network: 'mainnet-beta',
          address: mockWalletAddress,
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

        mockSolana.getInstance.mockResolvedValue(mockInstance as any);
        mockInstance.unwrapSOL.mockReturnValue(mockUnwrapInstruction);
        mockInstance.isHardwareWallet.mockResolvedValue(false);
        mockInstance.connection.getAccountInfo.mockResolvedValue({
          data: createMockAccountData(1_000_000_000),
          executable: false,
          lamports: 1_000_000_000,
          owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        });

        const mockKeypair = {
          publicKey: new PublicKey(mockWalletAddress),
          secretKey: new Uint8Array(64),
        };
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
          url: '/chains/solana/unwrap',
          payload: {
            network,
            address: mockWalletAddress,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(mockSolana.getInstance).toHaveBeenCalledWith(network);
      }
    });
  });
});

import { PublicKey, Transaction, Connection } from '@solana/web3.js';

// Mock the logger before importing Solana
jest.mock('../../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  redactUrl: jest.fn((url: string) => url), // Mock redactUrl to return URL as-is
}));

// Mock config manager
jest.mock('../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'solana.defaultNetwork') return 'mainnet-beta';
        if (key === 'solana.defaultWallet') return 'test-wallet';
        if (key === 'solana.rpcProvider') return 'url';
        if (key === 'solana-mainnet-beta.nodeURL') return 'https://api.mainnet-beta.solana.com';
        if (key === 'solana-mainnet-beta.nativeCurrencySymbol') return 'SOL';
        if (key === 'solana-mainnet-beta.defaultComputeUnits') return 200000;
        if (key === 'solana-mainnet-beta.confirmRetryInterval') return 2;
        if (key === 'solana-mainnet-beta.confirmRetryCount') return 30;
        if (key === 'solana-mainnet-beta.minPriorityFeePerCU') return 0;
        return undefined;
      }),
    })),
  },
}));

import { Solana } from '../../../src/chains/solana/solana';

describe('Solana Rate Limit Error Propagation', () => {
  let solana: Solana;
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(async () => {
    // Clear all instances before each test
    (Solana as any)._instances = new Map();

    solana = await Solana.getInstance('mainnet-beta');
    mockConnection = solana.connection as jest.Mocked<Connection>;

    // Mock heliusService to avoid WebSocket checks
    (solana as any).heliusService = {
      isWebSocketConnected: jest.fn().mockReturnValue(false),
    };

    // Mock prepareTx to return the transaction as-is
    jest.spyOn(solana as any, 'prepareTx').mockImplementation((tx: any) => {
      tx.recentBlockhash = 'test-blockhash';
      tx.feePayer = new PublicKey('11111111111111111111111111111112');
      return Promise.resolve(tx);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalances - Rate Limit Propagation', () => {
    it('should propagate 429 error from getSolBalance', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;
      (error429 as any).name = 'TooManyRequestsError';

      mockConnection.getBalance = jest.fn().mockRejectedValue(error429);

      await expect(solana.getBalances('11111111111111111111111111111112', ['SOL'])).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should propagate 429 error from fetchTokenAccounts', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;
      (error429 as any).name = 'TooManyRequestsError';

      // Mock SOL balance to succeed
      mockConnection.getBalance = jest.fn().mockResolvedValue(1000000000);

      // Mock token accounts to fail with 429
      mockConnection.getTokenAccountsByOwner = jest.fn().mockRejectedValue(error429);

      await expect(solana.getBalances('11111111111111111111111111111112', [])).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should not throw 429 for other errors in getSolBalance', async () => {
      const networkError = new Error('Network error');

      mockConnection.getBalance = jest.fn().mockRejectedValue(networkError);

      // Should return 0 for SOL balance on network errors (not 429)
      const result = await solana.getBalances('11111111111111111111111111111112', ['SOL']);
      expect(result.SOL).toBe(0);
    });
  });

  describe('confirmTransaction - Rate Limit Propagation', () => {
    it('should propagate 429 error from getTransaction', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getTransaction = jest.fn().mockRejectedValue(error429);
      mockConnection.getSignatureStatus = jest.fn().mockResolvedValue({ value: null });

      await expect(solana.confirmTransaction('test-signature', 5000)).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should propagate 429 error from getSignatureStatus', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      // Mock getTransaction to return txData so it proceeds to getSignatureStatus
      mockConnection.getTransaction = jest.fn().mockResolvedValue({
        meta: { fee: 5000, err: null },
      });
      mockConnection.getSignatureStatus = jest.fn().mockRejectedValue(error429);

      await expect(solana.confirmTransaction('test-signature', 5000)).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should wrap non-429 errors in confirmation error', async () => {
      const networkError = new Error('Network connection failed');

      mockConnection.getTransaction = jest.fn().mockRejectedValue(networkError);

      await expect(solana.confirmTransaction('test-signature', 5000)).rejects.toThrow('Failed to confirm transaction');

      await expect(solana.confirmTransaction('test-signature', 5000)).rejects.not.toMatchObject({
        statusCode: 429,
      });
    });
  });

  describe('Transaction Polling - Rate Limit Propagation', () => {
    it('should propagate 429 error during polling loop', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      // Mock successful transaction send
      mockConnection.sendRawTransaction = jest.fn().mockResolvedValue('test-signature');
      mockConnection.getLatestBlockhash = jest.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000000,
      });

      // Mock getSignatureStatuses to fail with 429
      mockConnection.getSignatureStatuses = jest.fn().mockRejectedValue(error429);

      // Test _sendAndConfirmRawTransaction directly
      const serializedTx = Buffer.from([1, 2, 3]); // Dummy serialized transaction
      await expect((solana as any)._sendAndConfirmRawTransaction(serializedTx)).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should propagate 429 error during re-broadcast', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      // Mock successful initial send, then fail with 429 on re-broadcast
      mockConnection.sendRawTransaction = jest
        .fn()
        .mockResolvedValueOnce('test-signature')
        .mockRejectedValueOnce(error429);

      mockConnection.getLatestBlockhash = jest.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 100,
      });

      // Mock status check to show no confirmation
      mockConnection.getSignatureStatuses = jest.fn().mockResolvedValue({
        value: [null],
      });

      // Mock blockhash expired scenario
      mockConnection.getBlockHeight = jest.fn().mockResolvedValue(101);

      const serializedTx = Buffer.from([1, 2, 3]);
      await expect((solana as any)._sendAndConfirmRawTransaction(serializedTx)).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should propagate 429 error from getBlockHeight during polling', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.sendRawTransaction = jest.fn().mockResolvedValue('test-signature');
      mockConnection.getLatestBlockhash = jest.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000000,
      });

      mockConnection.getSignatureStatuses = jest.fn().mockResolvedValue({
        value: [null],
      });

      // getBlockHeight fails with 429
      mockConnection.getBlockHeight = jest.fn().mockRejectedValue(error429);

      const serializedTx = Buffer.from([1, 2, 3]);
      await expect((solana as any)._sendAndConfirmRawTransaction(serializedTx)).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should continue polling on non-429 errors', async () => {
      const networkError = new Error('Network timeout');

      mockConnection.sendRawTransaction = jest.fn().mockResolvedValue('test-signature');
      mockConnection.getLatestBlockhash = jest.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000000,
      });

      // First few attempts fail with network error
      let attempts = 0;
      mockConnection.getSignatureStatuses = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(networkError);
        }
        // Eventually succeed
        return Promise.resolve({
          value: [{ confirmationStatus: 'confirmed', err: null }],
        });
      });

      mockConnection.getTransaction = jest.fn().mockResolvedValue({
        meta: { fee: 5000, err: null },
      });

      mockConnection.getBlockHeight = jest.fn().mockResolvedValue(100);

      const serializedTx = Buffer.from([1, 2, 3]);
      const result = await (solana as any)._sendAndConfirmRawTransaction(serializedTx);

      expect(result.signature).toBeTruthy();
      expect(result.confirmed).toBe(true);
      expect(attempts).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle 429 error without statusCode property', async () => {
      // Error has 429 in message but no statusCode property
      const error = new Error('429 Too Many Requests');

      mockConnection.getBalance = jest.fn().mockRejectedValue(error);

      // Interceptor should add statusCode
      await expect(solana.getBalances('11111111111111111111111111111112', ['SOL'])).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should handle compound errors with 429', async () => {
      const error = {
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests for specific RPC call',
      };

      mockConnection.getBalance = jest.fn().mockRejectedValue(error);

      await expect(solana.getBalances('11111111111111111111111111111112', ['SOL'])).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should not throw for non-429 status codes (returns 0 balance)', async () => {
      const error500 = new Error('Internal Server Error');
      (error500 as any).statusCode = 500;

      mockConnection.getBalance = jest.fn().mockRejectedValue(error500);

      // Non-429 errors should return 0 for SOL balance, not throw
      const result = await solana.getBalances('11111111111111111111111111111112', ['SOL']);
      expect(result.SOL).toBe(0);
    });
  });
});

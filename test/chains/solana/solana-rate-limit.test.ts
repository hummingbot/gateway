import { Connection, PublicKey } from '@solana/web3.js';

import { createRateLimitAwareSolanaConnection } from '../../../src/rpc/rpc-connection-interceptor';

describe('Solana Rate Limit Interceptor', () => {
  let mockConnection: jest.Mocked<Connection>;
  let wrappedConnection: Connection;
  let setTimeoutSpy: jest.SpyInstance;
  let randomSpy: jest.SpyInstance | undefined;
  const testRpcUrl = 'https://api.mainnet-beta.solana.com';

  beforeEach(() => {
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return 0 as any;
    });

    // Create a mock Connection
    mockConnection = {
      getBalance: jest.fn(),
      getParsedTokenAccountsByOwner: jest.fn(),
      getSignatureStatuses: jest.fn(),
      getTransaction: jest.fn(),
      getBlockHeight: jest.fn(),
      sendRawTransaction: jest.fn(),
      getSignatureStatus: jest.fn(),
    } as any;

    wrappedConnection = createRateLimitAwareSolanaConnection(mockConnection, testRpcUrl);
  });

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
    setTimeoutSpy.mockRestore();
  });

  describe('429 Error Detection', () => {
    it('should detect 429 error with statusCode property', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getBalance.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112')),
      ).rejects.toMatchObject({
        statusCode: 429,
        name: 'TooManyRequestsError',
        message: expect.stringContaining('Solana RPC rate limit exceeded'),
      });
    });

    it('should detect 429 error with code property', async () => {
      const error429 = new Error('Rate limit');
      (error429 as any).code = 429;

      mockConnection.getBalance.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112')),
      ).rejects.toMatchObject({
        statusCode: 429,
        name: 'TooManyRequestsError',
      });
    });

    it('should detect 429 error in error message', async () => {
      const error429 = new Error('429 Too Many Requests: {"jsonrpc":"2.0","error":{"code": 429}}');

      mockConnection.getBalance.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112')),
      ).rejects.toMatchObject({
        statusCode: 429,
        name: 'TooManyRequestsError',
      });
    });

    it('should detect "too many requests" in error message (case insensitive)', async () => {
      const error429 = new Error('Too Many Requests for a specific RPC call');

      mockConnection.getBalance.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112')),
      ).rejects.toMatchObject({
        statusCode: 429,
        name: 'TooManyRequestsError',
      });
    });
  });

  describe('Error Message Content', () => {
    it('should include RPC URL in error message', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getBalance.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112')),
      ).rejects.toMatchObject({
        message: expect.stringContaining(testRpcUrl),
      });
    });
  });

  describe('Non-429 Errors', () => {
    it('should pass through non-rate-limit errors unchanged', async () => {
      const networkError = new Error('Network connection failed');

      mockConnection.getBalance.mockRejectedValue(networkError);

      await expect(wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112'))).rejects.toThrow(
        'Network connection failed',
      );
    });

    it('should not modify successful responses', async () => {
      const balance = 1000000000; // 1 SOL in lamports
      mockConnection.getBalance.mockResolvedValue(balance);

      const result = await wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112'));

      expect(result).toBe(balance);
    });
  });

  describe('Different Connection Methods', () => {
    it('should intercept getTransaction', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getTransaction.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getTransaction('signature123', {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        }),
      ).rejects.toMatchObject({
        statusCode: 429,
      });
      expect(mockConnection.getTransaction).toHaveBeenCalledTimes(4);
    });

    it('should use growing exponential retry delays', async () => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getTransaction.mockRejectedValue(error429);

      await expect(wrappedConnection.getTransaction('signature123')).rejects.toMatchObject({ statusCode: 429 });
      expect(setTimeoutSpy.mock.calls.map((call) => call[1])).toEqual([500, 1000, 2000]);
    });

    it('should keep jitter within 20 percent of the retry delay', async () => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValueOnce(0.5);
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getTransaction.mockRejectedValue(error429);

      await expect(wrappedConnection.getTransaction('signature123')).rejects.toMatchObject({ statusCode: 429 });
      expect(setTimeoutSpy.mock.calls.map((call) => call[1])).toEqual([400, 1200, 2000]);
    });

    it('should retry getTransaction and return successful response', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;
      const txData = { meta: { fee: 123 } } as any;

      mockConnection.getTransaction.mockRejectedValueOnce(error429).mockResolvedValueOnce(txData);

      await expect(wrappedConnection.getTransaction('signature123')).resolves.toBe(txData);
      expect(mockConnection.getTransaction).toHaveBeenCalledTimes(2);
    });

    it('should not retry sendRawTransaction', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.sendRawTransaction.mockRejectedValue(error429);

      await expect(wrappedConnection.sendRawTransaction(Buffer.from([]))).rejects.toMatchObject({
        statusCode: 429,
      });
      expect(mockConnection.sendRawTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Property Access', () => {
    it('should allow access to non-function properties', () => {
      (mockConnection as any).commitment = 'confirmed';

      expect((wrappedConnection as any).commitment).toBe('confirmed');
    });

    it('should allow method binding', async () => {
      mockConnection.getBalance.mockResolvedValue(1000000000);

      const getBalance = wrappedConnection.getBalance.bind(wrappedConnection);
      const result = await getBalance(new PublicKey('11111111111111111111111111111112'));

      expect(result).toBe(1000000000);
    });
  });
});

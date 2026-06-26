import { Connection, PublicKey } from '@solana/web3.js';
import { providers } from 'ethers';

import {
  createRateLimitAwareEthereumProvider,
  createRateLimitAwareSolanaConnection,
} from '../../../src/rpc/rpc-connection-interceptor';

describe('Solana Rate Limit Interceptor', () => {
  let mockConnection: jest.Mocked<Connection>;
  let wrappedConnection: Connection;
  let setTimeoutSpy: jest.SpyInstance;
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

    it('should detect 429 in JSON error response', async () => {
      const error429 = new Error(
        'RPC Error: {"jsonrpc":"2.0","error":{"code": 429, "message":"Too many requests for a specific RPC call"}}',
      );

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

    it('should include helpful error message with fix instructions', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getBalance.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getBalance(new PublicKey('11111111111111111111111111111112')),
      ).rejects.toMatchObject({
        statusCode: 429,
        message: expect.stringContaining('rate limit'),
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
    it('should intercept getParsedTokenAccountsByOwner', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getParsedTokenAccountsByOwner.mockRejectedValue(error429);

      await expect(
        wrappedConnection.getParsedTokenAccountsByOwner(new PublicKey('11111111111111111111111111111112'), {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        }),
      ).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should intercept getSignatureStatuses', async () => {
      const error429 = new Error('Too many requests');
      (error429 as any).statusCode = 429;

      mockConnection.getSignatureStatuses.mockRejectedValue(error429);

      await expect(wrappedConnection.getSignatureStatuses(['signature123'])).rejects.toMatchObject({
        statusCode: 429,
      });
    });

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

describe('Ethereum Rate Limit Interceptor', () => {
  let mockProvider: jest.Mocked<providers.BaseProvider>;
  let wrappedProvider: providers.BaseProvider;
  let setTimeoutSpy: jest.SpyInstance;
  const testRpcUrl = 'https://eth.llamarpc.com';

  beforeEach(() => {
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return 0 as any;
    });

    mockProvider = {
      call: jest.fn(),
      getBalance: jest.fn(),
      sendTransaction: jest.fn(),
    } as any;

    wrappedProvider = createRateLimitAwareEthereumProvider(mockProvider, testRpcUrl);
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
  });

  // Ethereum reads are retried here. The provider is built with throttleLimit: 1
  // (see ethereum.ts) so ethers doesn't retry 429s itself — this Proxy is the
  // single retry layer, and it also covers 429s returned as a JSON-RPC error body.
  it('should retry getBalance and return successful response', async () => {
    const error429 = new Error('Too many requests');
    (error429 as any).statusCode = 429;

    mockProvider.getBalance.mockRejectedValueOnce(error429).mockResolvedValueOnce(123 as any);

    await expect(wrappedProvider.getBalance('0x0000000000000000000000000000000000000000')).resolves.toBe(123);
    expect(mockProvider.getBalance).toHaveBeenCalledTimes(2);
  });

  it('should retry getBalance up to 4 attempts then throw a normalized 429', async () => {
    const error429 = new Error('Too many requests');
    (error429 as any).statusCode = 429;

    mockProvider.getBalance.mockRejectedValue(error429);

    await expect(wrappedProvider.getBalance('0x0000000000000000000000000000000000000000')).rejects.toMatchObject({
      statusCode: 429,
      name: 'TooManyRequestsError',
    });
    expect(mockProvider.getBalance).toHaveBeenCalledTimes(4);
  });

  it('should retry call and return successful response', async () => {
    const error429 = new Error('Too many requests');
    (error429 as any).statusCode = 429;

    mockProvider.call.mockRejectedValueOnce(error429).mockResolvedValueOnce('0x01');

    await expect(wrappedProvider.call({ to: '0x0000000000000000000000000000000000000000' })).resolves.toBe('0x01');
    expect(mockProvider.call).toHaveBeenCalledTimes(2);
  });

  it('should detect 429 returned as a JSON-RPC error body and retry', async () => {
    const bodyError = new Error(
      'processing response error: {"jsonrpc":"2.0","error":{"code": 429, "message":"Too many requests"}}',
    );

    mockProvider.call.mockRejectedValueOnce(bodyError).mockResolvedValueOnce('0x01');

    await expect(wrappedProvider.call({ to: '0x0000000000000000000000000000000000000000' })).resolves.toBe('0x01');
    expect(mockProvider.call).toHaveBeenCalledTimes(2);
  });

  it('should pass through non-429 errors unchanged', async () => {
    mockProvider.getBalance.mockRejectedValue(new Error('Network connection failed'));

    await expect(wrappedProvider.getBalance('0x0000000000000000000000000000000000000000')).rejects.toThrow(
      'Network connection failed',
    );
  });

  it('should not retry sendTransaction', async () => {
    const error429 = new Error('Too many requests');
    (error429 as any).statusCode = 429;

    mockProvider.sendTransaction.mockRejectedValue(error429);

    await expect(wrappedProvider.sendTransaction('0x')).rejects.toMatchObject({
      statusCode: 429,
      name: 'TooManyRequestsError',
    });
    expect(mockProvider.sendTransaction).toHaveBeenCalledTimes(1);
  });
});

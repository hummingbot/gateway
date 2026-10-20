import { providers } from 'ethers';

import {
  createRateLimitAwareEthereumProvider,
  rateLimitAwareConnection,
} from '../../src/rpc/rpc-connection-interceptor';

/**
 * A 429 reaching the retry Proxy depends entirely on how the connection is configured,
 * because ethers decides there whether the status survives. These tests pin both halves:
 * the connection settings, and the Proxy's reaction to each error shape ethers can
 * produce for a rate limit.
 */

// What ethers throws for a 429 when throttleCallback declines the retry: the non-2xx
// path, which preserves the status.
const badResponse = () =>
  Object.assign(new Error('missing revert data in call exception'), {
    code: 'CALL_EXCEPTION',
    error: { reason: 'bad response', code: 'SERVER_ERROR', status: 429, body: '{"code":-32007}' },
  });

// What ethers throws for the same 429 with throttleLimit: 1 and no throttleCallback:
// the exhausted-retry path, which drops the status, headers and body.
const failedResponse = () =>
  Object.assign(new Error('missing revert data in call exception'), {
    code: 'CALL_EXCEPTION',
    error: {
      reason: 'failed response',
      code: 'SERVER_ERROR',
      requestBody: '{}',
      requestMethod: 'POST',
      url: 'https://node',
    },
  });

function providerWhoseCallFails(error: () => Error, failures: number) {
  let attempts = 0;
  const stub = {
    call: jest.fn(async () => {
      attempts += 1;
      if (attempts <= failures) throw error();
      return '0xok';
    }),
    getAttempts: () => attempts,
  };
  return stub as unknown as providers.BaseProvider & { getAttempts: () => number };
}

describe('rateLimitAwareConnection', () => {
  it('keeps ethers from retrying 429s itself', () => {
    expect(rateLimitAwareConnection('https://node').throttleLimit).toBe(1);
  });

  it('declines the ethers retry via throttleCallback, so the 429 keeps its status', async () => {
    const { throttleCallback } = rateLimitAwareConnection('https://node');
    expect(throttleCallback).toBeDefined();
    // Returning false routes the 429 out through ethers' non-2xx path ("bad response",
    // status preserved) instead of the exhausted-retry path that discards it.
    await expect(throttleCallback!(0, 'https://node')).resolves.toBe(false);
  });

  it('passes the url through unchanged', () => {
    expect(rateLimitAwareConnection('https://node/key').url).toBe('https://node/key');
  });
});

describe('createRateLimitAwareEthereumProvider', () => {
  it('retries a read whose 429 arrived with its status intact', async () => {
    const stub = providerWhoseCallFails(badResponse, 2);
    const wrapped = createRateLimitAwareEthereumProvider(stub, 'https://node');
    await expect(wrapped.call({} as any)).resolves.toBe('0xok');
    expect(stub.getAttempts()).toBe(3);
  });

  it('gives up with a 429 error after exhausting retries', async () => {
    const stub = providerWhoseCallFails(badResponse, 99);
    const wrapped = createRateLimitAwareEthereumProvider(stub, 'https://node');
    await expect(wrapped.call({} as any)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('keeps an Infura path key out of the 429 message', async () => {
    const key = '0123456789abcdef0123456789abcdef';
    const stub = providerWhoseCallFails(badResponse, 99);
    const wrapped = createRateLimitAwareEthereumProvider(stub, `https://solana-mainnet.infura.io/v3/${key}`);
    const call = wrapped.call({} as any);
    await expect(call).rejects.toThrow('https://solana-mainnet.infura.io/v3/***');
    await expect(call).rejects.not.toThrow(key);
  });

  it('does not retry an error that is not a rate limit', async () => {
    const stub = providerWhoseCallFails(
      () => Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION' }),
      1,
    );
    const wrapped = createRateLimitAwareEthereumProvider(stub, 'https://node');
    await expect(wrapped.call({} as any)).rejects.toThrow('execution reverted');
    expect(stub.getAttempts()).toBe(1);
  });

  it('cannot see a 429 that ethers stripped — the reason the connection must decline the retry', async () => {
    // This documents the bug rateLimitAwareConnection exists to prevent. Nothing in this
    // error says "rate limit", so no detector can classify it and the read fails outright.
    const stub = providerWhoseCallFails(failedResponse, 1);
    const wrapped = createRateLimitAwareEthereumProvider(stub, 'https://node');
    await expect(wrapped.call({} as any)).rejects.toThrow('missing revert data');
    expect(stub.getAttempts()).toBe(1);
    expect(JSON.stringify(failedResponse())).not.toContain('429');
  });
});

describe('createRateLimitAwareEthereumProvider over a provider', () => {
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

  it('should detect 429 returned as a JSON-RPC error body and retry', async () => {
    const bodyError = new Error(
      'processing response error: {"jsonrpc":"2.0","error":{"code": 429, "message":"Too many requests"}}',
    );

    mockProvider.call.mockRejectedValueOnce(bodyError).mockResolvedValueOnce('0x01');

    await expect(wrappedProvider.call({ to: '0x0000000000000000000000000000000000000000' })).resolves.toBe('0x01');
    expect(mockProvider.call).toHaveBeenCalledTimes(2);
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

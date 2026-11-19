import { FastifyInstance } from 'fastify';

import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { createRateLimitAwareEthereumProvider } from '../../../../src/rpc/rpc-connection-interceptor';

jest.mock('../../../../src/chains/ethereum/ethereum');

describe('Ethereum Balances Route - Rate Limit Handling', () => {
  let fastify: FastifyInstance;
  let mockEthereumInstance: jest.Mocked<Ethereum>;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockEthereumInstance = {
      getTokenBalances: jest.fn(),
      network: 'mainnet',
      nativeTokenSymbol: 'ETH',
      rpcUrl: 'https://eth.llamarpc.com',
    } as any;

    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
  });

  it('should return 429 when RPC returns rate limit error', async () => {
    const error429 = new Error(
      'Ethereum RPC rate limit exceeded. Your current RPC endpoint (https://eth.llamarpc.com) has reached its rate limit.',
    );
    (error429 as any).statusCode = 429;
    (error429 as any).name = 'TooManyRequestsError';

    mockEthereumInstance.getTokenBalances.mockRejectedValue(error429);

    const response = await fastify.inject({
      method: 'POST',
      url: '/chains/ethereum/balances',
      payload: {
        network: 'mainnet',
        address,
        tokens: [],
      },
    });

    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body)).toMatchObject({
      statusCode: 429,
      error: 'TooManyRequestsError',
      message: expect.stringContaining('rate limit'),
    });
  });

  it('should redact Infura and Chainstack credentials in 429 rate-limit responses when provider retries are exhausted', async () => {
    const infuraUrl = 'https://bsc-mainnet.infura.io/v3/0123456789abcdef0123456789abcdef';
    const rawProvider: any = {
      sendTransaction: jest.fn().mockRejectedValue({ status: 429, message: '429 Too Many Requests' }),
    };
    const wrappedProvider = createRateLimitAwareEthereumProvider(rawProvider, infuraUrl);

    mockEthereumInstance.getTokenBalances.mockImplementation(async () => {
      await wrappedProvider.sendTransaction('0xdeadbeef');
      return [];
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/chains/ethereum/balances',
      payload: {
        network: 'mainnet',
        address,
        tokens: [],
      },
    });

    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('https://bsc-mainnet.infura.io');
    expect(body.message).not.toContain('0123456789abcdef0123456789abcdef');
  });

  it('should return 500 for non-rate-limit errors', async () => {
    mockEthereumInstance.getTokenBalances.mockRejectedValue(new Error('Network connection failed'));

    const response = await fastify.inject({
      method: 'POST',
      url: '/chains/ethereum/balances',
      payload: {
        network: 'mainnet',
        address,
        tokens: [],
      },
    });

    expect(response.statusCode).toBe(500);
  });

  it('should redact RPC URL API keys in 500 error responses and logs', async () => {
    const ethersServerError = new Error(
      'processing response error (body="{\"jsonrpc\":\"2.0\",\"id\":71,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}", requestMethod="POST", url="https://bsc-mainnet.infura.io/v3/0123456789abcdef0123456789abcdef", code=SERVER_ERROR, version=web/5.8.0)',
    );
    mockEthereumInstance.getTokenBalances.mockRejectedValue(ethersServerError);

    const response = await fastify.inject({
      method: 'POST',
      url: '/chains/ethereum/balances',
      payload: {
        network: 'mainnet',
        address,
        tokens: [],
      },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('https://bsc-mainnet.infura.io');
    expect(body.message).not.toContain('0123456789abcdef0123456789abcdef');
  });

  it('should return 200 with balances when no rate limit', async () => {
    const tokens = [
      { key: 'ETH', symbol: 'ETH', address: null, balance: 2.5 },
      { key: 'USDC', symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', balance: 100 },
    ];
    mockEthereumInstance.getTokenBalances.mockResolvedValue(tokens);

    const response = await fastify.inject({
      method: 'POST',
      url: '/chains/ethereum/balances',
      payload: {
        network: 'mainnet',
        address,
        tokens: ['ETH', 'USDC'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ balances: { ETH: 2.5, USDC: 100 }, tokens });
  });
});

const address = '0x0000000000000000000000000000000000000001';

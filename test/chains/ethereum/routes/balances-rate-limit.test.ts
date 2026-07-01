import { FastifyInstance } from 'fastify';

import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Ethereum } from '../../../../src/chains/ethereum/ethereum';

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
      getBalances: jest.fn(),
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

    mockEthereumInstance.getBalances.mockRejectedValue(error429);

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

  it('should return 500 for non-rate-limit errors', async () => {
    mockEthereumInstance.getBalances.mockRejectedValue(new Error('Network connection failed'));

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

  it('should return 200 with balances when no rate limit', async () => {
    mockEthereumInstance.getBalances.mockResolvedValue({ ETH: 2.5, USDC: 100 });

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
    expect(JSON.parse(response.body)).toEqual({ balances: { ETH: 2.5, USDC: 100 } });
  });
});

const address = '0x0000000000000000000000000000000000000001';

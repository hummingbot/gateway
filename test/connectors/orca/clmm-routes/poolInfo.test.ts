import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/chains/solana/solana');
jest.mock('@solana/spl-token', () => ({
  getMint: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-sdk', () => ({
  PriceMath: {
    sqrtPriceX64ToPrice: jest.fn().mockReturnValue({
      toNumber: () => 200.5,
    }),
  },
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/connectors/orca/clmm-routes/poolInfo');
  await server.register(poolInfoRoute);
  return server;
};

const mockPoolAddress = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

// Mock whirlpool data (on-chain)
// Use valid Solana base58 addresses (no 0, O, I, l characters)
const mockWhirlpool = {
  tokenMintA: 'So11111111111111111111111111111111111111112',
  tokenMintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  tokenVaultA: '7jaiZR5Sk8hdYN9MxTpczTcwbWpb5WEoxSANuUwveuat',
  tokenVaultB: '3YQm7ujtXWJU2e9jhp2QGHpnn1ShXn12QjvzMvDgabpX',
  tickSpacing: 64,
  feeRate: 400, // 0.04%
  protocolFeeRate: 100, // 0.01%
  tickCurrentIndex: -28800,
  liquidity: new BN('1000000000'),
  sqrtPrice: new BN('123456789'),
};

// Mock API pool info (for analytics fields)
const mockApiPoolInfo = {
  address: mockPoolAddress,
  baseTokenAddress: 'So11111111111111111111111111111111111111112',
  quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  binStep: 64,
  feePct: 0.04,
  price: 200.5,
  baseTokenAmount: 1000,
  quoteTokenAmount: 200500,
  activeBinId: -28800,
  liquidity: '1000000000',
  sqrtPrice: '123456789',
  tvlUsdc: 50000,
  protocolFeeRate: 0.01,
  yieldOverTvl: 0.05,
};

describe('GET /pool-info', () => {
  let app: any;
  let getMintMock: jest.Mock;

  beforeAll(async () => {
    // Import getMint mock
    const splToken = await import('@solana/spl-token');
    getMintMock = splToken.getMint as jest.Mock;

    app = await buildApp();
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Orca.getInstance with both getWhirlpool and getPoolInfo
    const mockOrca = {
      getWhirlpool: jest.fn().mockResolvedValue(mockWhirlpool),
      getPoolInfo: jest.fn().mockResolvedValue(mockApiPoolInfo),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    // Mock Solana.getInstance
    const mockConnection = {
      getTokenAccountBalance: jest.fn().mockResolvedValue({
        value: { amount: '1000000000000' }, // 1000 tokens with 9 decimals
      }),
    };
    const mockSolana = {
      connection: mockConnection,
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    // Mock getMint
    getMintMock.mockResolvedValue({
      decimals: 9,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return pool information', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('address', mockPoolAddress);
    expect(body).toHaveProperty('baseTokenAddress');
    expect(body).toHaveProperty('quoteTokenAddress');
    expect(body).toHaveProperty('binStep');
    expect(body).toHaveProperty('feePct');
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('baseTokenAmount');
    expect(body).toHaveProperty('quoteTokenAmount');
    expect(body).toHaveProperty('activeBinId');
  });

  it('should return Orca-specific fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('liquidity');
    expect(body).toHaveProperty('sqrtPrice');
    expect(body).toHaveProperty('tvlUsdc');
    expect(body).toHaveProperty('protocolFeeRate');
    expect(body).toHaveProperty('yieldOverTvl');
  });

  it('should return 400 when poolAddress is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet-beta',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should handle when pool not found', async () => {
    const mockOrca = {
      getWhirlpool: jest.fn().mockResolvedValue(null),
      getPoolInfo: jest.fn().mockResolvedValue(null),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet-beta',
        poolAddress: 'invalid-pool-address',
      },
    });

    // Route now throws 404 when pool not found
    expect(response.statusCode).toBe(404);
  });

  it('should handle errors from Orca connector', async () => {
    const mockOrca = {
      getWhirlpool: jest.fn().mockRejectedValue(new Error('Failed to fetch pool')),
      getPoolInfo: jest.fn().mockResolvedValue(mockApiPoolInfo),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(500);
  });

  it('should use default network if not provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(Orca.getInstance).toHaveBeenCalled();
  });

  it('should handle Orca service unavailable', async () => {
    (Orca.getInstance as jest.Mock).mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(503);
  });
});

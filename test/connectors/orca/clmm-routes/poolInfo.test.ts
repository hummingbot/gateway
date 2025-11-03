import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/connectors/orca/clmm-routes/poolInfo');
  await server.register(poolInfoRoute);
  return server;
};

const mockPoolAddress = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const mockPoolInfo = {
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

  beforeAll(async () => {
    app = await buildApp();

    // Mock Orca.getInstance
    const mockOrca = {
      getPoolInfo: jest.fn().mockResolvedValue(mockPoolInfo),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);
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

    // Null result is returned as empty object by Fastify
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({});
  });

  it('should handle errors from Orca connector', async () => {
    const mockOrca = {
      getPoolInfo: jest.fn().mockRejectedValue(new Error('Failed to fetch pool')),
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
    const mockOrca = {
      getPoolInfo: jest.fn().mockResolvedValue(mockPoolInfo),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

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

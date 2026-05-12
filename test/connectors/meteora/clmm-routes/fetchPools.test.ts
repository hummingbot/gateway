import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/meteora/meteora');
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: '11111111111111111111111111111111',
  }),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { fetchPoolsRoute } = await import('../../../../src/connectors/meteora/clmm-routes/fetchPools');
  await server.register(fetchPoolsRoute);
  return server;
};

const mockMeteoraApiResponse = {
  pools: [
    {
      address: '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
      name: 'SOL-USDC',
      token_x: {
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Wrapped SOL',
        decimals: 9,
        is_verified: true,
      },
      token_y: {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        is_verified: true,
      },
      pool_config: {
        bin_step: 4,
        base_fee_pct: 0.04,
        max_fee_pct: 0,
        protocol_fee_pct: 5,
      },
      tvl: 3708880.74,
      current_price: 83.82,
      apr: 0.143,
      apy: 68.52,
      volume: { '24h': 13738342.03 },
      fees: { '24h': 5307.12 },
      is_blacklisted: false,
    },
    {
      address: 'AsSyvUnbfaZJPRrNh3kUuvZTeHKoMVWEoHz86f4Q5D9x',
      name: 'MET-SOL',
      token_x: {
        address: 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL',
        symbol: 'MET',
        name: 'Meteora',
        decimals: 9,
        is_verified: true,
      },
      token_y: {
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Wrapped SOL',
        decimals: 9,
        is_verified: true,
      },
      pool_config: {
        bin_step: 20,
        base_fee_pct: 0.2,
        max_fee_pct: 0,
        protocol_fee_pct: 5,
      },
      tvl: 627207.71,
      current_price: 0.00183,
      apr: 0.14,
      apy: 67.0,
      volume: { '24h': 462925.85 },
      fees: { '24h': 881.74 },
      is_blacklisted: false,
    },
  ],
  total: 81391,
  page: 1,
  pageSize: 50,
};

describe('GET /fetch-pools (Meteora)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch pools with default parameters', async () => {
    const mockMeteoraInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue(mockMeteoraApiResponse),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toHaveProperty('pools');
    expect(body).toHaveProperty('total', 81391);
    expect(body).toHaveProperty('page', 1);
    expect(body).toHaveProperty('pageSize', 50);

    expect(body.pools).toHaveLength(2);
    expect(body.pools[0]).toEqual({
      address: '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
      name: 'SOL-USDC',
      baseTokenAddress: 'So11111111111111111111111111111111111111112',
      baseTokenSymbol: 'SOL',
      quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      quoteTokenSymbol: 'USDC',
      binStep: 4,
      baseFee: 0.04,
      price: 83.82,
      tvl: 3708880.74,
      apr: 0.143,
      apy: 68.52,
      volume24h: 13738342.03,
      fees24h: 5307.12,
    });
  });

  it('should fetch pools with search query', async () => {
    const mockMeteoraInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue({
        pools: [mockMeteoraApiResponse.pools[0]],
        total: 1,
        page: 1,
        pageSize: 50,
      }),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&query=SOL-USDC&limit=10',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.pools).toHaveLength(1);
    expect(body.pools[0].name).toBe('SOL-USDC');

    // Verify fetchPoolsFromApi was called with correct params
    expect(mockMeteoraInstance.fetchPoolsFromApi).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        query: 'SOL-USDC',
      }),
    );
  });

  it('should fetch pools with sorting', async () => {
    const mockMeteoraInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue(mockMeteoraApiResponse),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&sortBy=tvl:desc',
    });

    expect(response.statusCode).toBe(200);
    expect(mockMeteoraInstance.fetchPoolsFromApi).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'tvl:desc',
      }),
    );
  });

  it('should handle API errors gracefully', async () => {
    const mockMeteoraInstance = {
      fetchPoolsFromApi: jest.fn().mockRejectedValue(new Error('Meteora API error')),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta',
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should handle empty pool results', async () => {
    const mockMeteoraInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue({
        pools: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&query=NONEXISTENT',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pools).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('should filter unverified pools when includeUnverified is false', async () => {
    const mockMeteoraInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue({
        pools: [mockMeteoraApiResponse.pools[0]],
        total: 1,
        page: 1,
        pageSize: 50,
      }),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&includeUnverified=false',
    });

    expect(response.statusCode).toBe(200);
    expect(mockMeteoraInstance.fetchPoolsFromApi).toHaveBeenCalledWith(
      expect.objectContaining({
        includeUnverified: false,
      }),
    );
  });
});

import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: '11111111111111111111111111111111',
  }),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { fetchPoolsRoute } = await import('../../../../src/connectors/orca/clmm-routes/fetchPools');
  await server.register(fetchPoolsRoute);
  return server;
};

// Mock Orca API response format
const mockOrcaApiResponse = [
  {
    address: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    tokenMintA: 'So11111111111111111111111111111111111111112',
    tokenMintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    tokenA: {
      symbol: 'SOL',
      name: 'Wrapped SOL',
      decimals: 9,
      imageUrl:
        'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    },
    tokenB: {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      imageUrl:
        'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    },
    tickSpacing: 64,
    feeRate: 2500, // 0.25% in hundredths of basis points
    price: '150.5',
    tvlUsdc: 5000000,
    feeApr: { day: 0.15 },
    totalApr: { day: 0.25 },
    volume: { day: 1000000 },
    fees: { day: 2500 },
  },
  {
    address: '2AEWSvUds1wsufnsDPCXjFsJCMJH5SNNm7fSF4kxys9a',
    tokenMintA: 'So11111111111111111111111111111111111111112',
    tokenMintB: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    tokenA: {
      symbol: 'SOL',
      name: 'Wrapped SOL',
      decimals: 9,
      imageUrl: 'https://example.com/sol.png',
    },
    tokenB: {
      symbol: 'USDT',
      name: 'USDT',
      decimals: 6,
      imageUrl: 'https://example.com/usdt.png',
    },
    tickSpacing: 64,
    feeRate: 2500,
    price: '148.2',
    tvlUsdc: 3000000,
    feeApr: { day: 0.12 },
    totalApr: { day: 0.2 },
    volume: { day: 800000 },
    fees: { day: 2000 },
  },
];

describe('GET /fetch-pools (Orca)', () => {
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
    const mockOrcaInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue(mockOrcaApiResponse),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrcaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toHaveProperty('pools');
    expect(body).toHaveProperty('total', 2);
    expect(body).toHaveProperty('page', 1);
    expect(body).toHaveProperty('pageSize', 50);

    expect(body.pools).toHaveLength(2);
    expect(body.pools[0]).toEqual({
      address: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      name: 'SOL-USDC',
      baseTokenAddress: 'So11111111111111111111111111111111111111112',
      baseTokenSymbol: 'SOL',
      quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      quoteTokenSymbol: 'USDC',
      binStep: 64,
      baseFee: 0.25,
      price: 150.5,
      tvl: 5000000,
      apr: 15, // 0.15 * 100
      apy: 25, // 0.25 * 100
      volume24h: 1000000,
      fees24h: 2500,
    });
  });

  it('should fetch pools with search query', async () => {
    const mockOrcaInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue([mockOrcaApiResponse[0]]),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrcaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&query=SOL-USDC&limit=10',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.pools).toHaveLength(1);
    expect(body.pools[0].name).toBe('SOL-USDC');

    // Verify fetchPoolsFromApi was called with correct params
    expect(mockOrcaInstance.fetchPoolsFromApi).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        query: 'SOL-USDC',
      }),
    );
  });

  it('should fetch pools with sorting', async () => {
    const mockOrcaInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue(mockOrcaApiResponse),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrcaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&sortBy=tvl&sortDirection=desc',
    });

    expect(response.statusCode).toBe(200);
    expect(mockOrcaInstance.fetchPoolsFromApi).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'tvl',
        sortDirection: 'desc',
      }),
    );
  });

  it('should handle API errors gracefully', async () => {
    const mockOrcaInstance = {
      fetchPoolsFromApi: jest.fn().mockRejectedValue(new Error('Orca API error')),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrcaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta',
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should handle empty pool results', async () => {
    const mockOrcaInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue([]),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrcaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&query=NONEXISTENT',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pools).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('should pass verifiedOnly parameter to API', async () => {
    const mockOrcaInstance = {
      fetchPoolsFromApi: jest.fn().mockResolvedValue([mockOrcaApiResponse[0]]),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrcaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/fetch-pools?network=mainnet-beta&verifiedOnly=true',
    });

    expect(response.statusCode).toBe(200);
    expect(mockOrcaInstance.fetchPoolsFromApi).toHaveBeenCalledWith(
      expect.objectContaining({
        verifiedOnly: true,
      }),
    );
  });
});

import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/chains/solana/solana');
jest.mock('@solana-program/token-2022', () => ({
  fetchAllMint: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-core', () => ({
  sqrtPriceToPrice: jest.fn().mockReturnValue(200.5),
}));

// Stub the bin-distribution helper so we can assert it's called only when
// binCount > 0, and so the test doesn't hit the network for getProgramAccounts.
jest.mock('../../../../src/connectors/orca/orca.utils', () => {
  const actual = jest.requireActual('../../../../src/connectors/orca/orca.utils');
  return {
    ...actual,
    computeOrcaBinDistribution: jest.fn(),
  };
});

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolsRoute } = await import('../../../../src/trading/clmm/pools');
  await server.register(poolsRoute);
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
  liquidity: 1000000000n,
  sqrtPrice: 123456789n,
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
  let fetchAllMintMock: jest.Mock;

  beforeAll(async () => {
    // Import fetchAllMint mock
    const token2022 = await import('@solana-program/token-2022');
    fetchAllMintMock = token2022.fetchAllMint as jest.Mock;

    app = await buildApp();
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Orca.getInstance with both getWhirlpool and getPoolInfo
    const mockOrca = {
      getWhirlpool: jest.fn().mockResolvedValue(mockWhirlpool),
      getPoolInfo: jest.fn().mockResolvedValue(mockApiPoolInfo),
      solanaKitRpc: {}, // Mock RPC
      deployment: { programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' },
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

    // Mock fetchAllMint - returns array of mint data with .data.decimals structure
    fetchAllMintMock.mockResolvedValue([
      { data: { decimals: 9 } }, // mintA
      { data: { decimals: 9 } }, // mintB
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reads the fee from hundredths of a basis point and scales each vault by its own mint', async () => {
    // SOL (9 decimals) against USDC (6): a shared divisor would misreport one side.
    fetchAllMintMock.mockResolvedValue([{ data: { decimals: 9 } }, { data: { decimals: 6 } }]);
    const { sqrtPriceToPrice } = await import('@orca-so/whirlpools-core');
    const vaultBalances: Record<string, string> = {
      [mockWhirlpool.tokenVaultA]: '1000000000000', // 1000 SOL
      [mockWhirlpool.tokenVaultB]: '200500000000', // 200,500 USDC
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      connection: {
        getTokenAccountBalance: jest.fn(async (vault: any) => ({ value: { amount: vaultBalances[vault.toBase58()] } })),
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(parseWire(response.body)).toEqual({
      address: mockPoolAddress,
      baseTokenAddress: mockWhirlpool.tokenMintA,
      quoteTokenAddress: mockWhirlpool.tokenMintB,
      binStep: 64,
      feePct: 0.04, // feeRate 400
      price: 200.5,
      baseTokenAmount: 1000,
      quoteTokenAmount: 200500,
      activeBinId: -28800,
    });
    expect(sqrtPriceToPrice).toHaveBeenCalledWith(mockWhirlpool.sqrtPrice, 9, 6);
  });

  // Orca's connector-specific pool fields (liquidity, sqrtPrice, tvlUsdc, ...) are not
  // part of the unified /trading/clmm/pool-info response schema, which serializes the
  // shared shape. Removing the per-connector route removed the only HTTP surface that
  // exposed them, so this asserts the connector still produces them for callers in-process.
  it('still produces Orca-specific fields from the connector function', async () => {
    const { getPoolInfo } = await import('../../../../src/connectors/orca/clmm-routes/poolInfo');
    const info: any = await getPoolInfo(app, 'mainnet-beta', mockPoolAddress);

    expect(info).toHaveProperty('liquidity');
    expect(info).toHaveProperty('sqrtPrice');
    expect(info).toHaveProperty('tvlUsdc');
    expect(info).toHaveProperty('protocolFeeRate');
    expect(info).toHaveProperty('yieldOverTvl');
  });

  it('reports an unknown TVL as null, not 0, when the Orca API has no pool', async () => {
    (Orca.getInstance as jest.Mock).mockResolvedValue({
      getWhirlpool: jest.fn().mockResolvedValue(mockWhirlpool),
      getPoolInfo: jest.fn().mockResolvedValue(null),
      solanaKitRpc: {},
      deployment: { programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' },
    });
    const { getPoolInfo } = await import('../../../../src/connectors/orca/clmm-routes/poolInfo');
    const info: any = await getPoolInfo(app, 'mainnet-beta', mockPoolAddress);

    expect(info.tvlUsdc).toBeNull();
    expect(info.yieldOverTvl).toBeNull();
  });

  it("answers 500 with the cause when Orca's API lookup fails", async () => {
    const cause = `Orca API pool lookup for ${mockPoolAddress} failed: 503 Service Unavailable`;
    (Orca.getInstance as jest.Mock).mockResolvedValue({
      getWhirlpool: jest.fn().mockResolvedValue(mockWhirlpool),
      getPoolInfo: jest.fn().mockRejectedValue(new Error(cause)),
      solanaKitRpc: {},
      deployment: { programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: { chainNetwork: 'solana-mainnet-beta', connector: 'orca', poolAddress: mockPoolAddress },
    });

    expect(response.statusCode).toBe(500);
    expect(parseWire(response.body).message).toBe(`Failed to get CLMM pool info: ${cause}`);
  });

  it('carries the API TVL through when Orca reports one', async () => {
    const { getPoolInfo } = await import('../../../../src/connectors/orca/clmm-routes/poolInfo');
    const info: any = await getPoolInfo(app, 'mainnet-beta', mockPoolAddress);

    expect(info.tvlUsdc).toBe(50000);
    expect(info.yieldOverTvl).toBe(0.05);
  });

  it('should return 400 when poolAddress is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
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
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
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
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(500);
  });

  it('should handle Orca service unavailable', async () => {
    (Orca.getInstance as jest.Mock).mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        poolAddress: mockPoolAddress,
      },
    });

    expect(response.statusCode).toBe(503);
  });

  describe('binCount param', () => {
    const sampleBins = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        binId: -28800 + i,
        price: 200 + i * 0.01,
        baseTokenAmount: i < 5 ? 0 : 100,
        quoteTokenAmount: i < 5 ? 100 : 0,
      }));

    it('omits bins[] when binCount is not provided', async () => {
      const { computeOrcaBinDistribution } = await import('../../../../src/connectors/orca/orca.utils');
      const response = await app.inject({
        method: 'GET',
        url: '/pool-info',
        query: { chainNetwork: 'solana-mainnet-beta', connector: 'orca', poolAddress: mockPoolAddress },
      });
      expect(response.statusCode).toBe(200);
      const body = parseWire(response.body);
      expect(body.bins).toBeUndefined();
      expect(computeOrcaBinDistribution).not.toHaveBeenCalled();
    });

    it('omits bins[] when binCount=0', async () => {
      const { computeOrcaBinDistribution } = await import('../../../../src/connectors/orca/orca.utils');
      const response = await app.inject({
        method: 'GET',
        url: '/pool-info',
        query: { chainNetwork: 'solana-mainnet-beta', connector: 'orca', poolAddress: mockPoolAddress, binCount: 0 },
      });
      expect(response.statusCode).toBe(200);
      const body = parseWire(response.body);
      expect(body.bins).toBeUndefined();
      expect(computeOrcaBinDistribution).not.toHaveBeenCalled();
    });

    it('returns bins[] of length N when binCount=N', async () => {
      const { computeOrcaBinDistribution } = await import('../../../../src/connectors/orca/orca.utils');
      (computeOrcaBinDistribution as jest.Mock).mockResolvedValueOnce(sampleBins(11));
      const response = await app.inject({
        method: 'GET',
        url: '/pool-info',
        query: { chainNetwork: 'solana-mainnet-beta', connector: 'orca', poolAddress: mockPoolAddress, binCount: 11 },
      });
      expect(response.statusCode).toBe(200);
      const body = parseWire(response.body);
      expect(Array.isArray(body.bins)).toBe(true);
      expect(body.bins).toHaveLength(11);
      expect(body.bins[0]).toEqual(
        expect.objectContaining({
          binId: expect.any(Number),
          price: expect.any(Number),
          baseTokenAmount: expect.any(Number),
          quoteTokenAmount: expect.any(Number),
        }),
      );
      expect(computeOrcaBinDistribution).toHaveBeenCalledTimes(1);
      const call = (computeOrcaBinDistribution as jest.Mock).mock.calls[0][0];
      expect(call.binCount).toBe(11);
      expect(call.tickSpacing).toBe(mockWhirlpool.tickSpacing);
      expect(call.currentTickIndex).toBe(mockWhirlpool.tickCurrentIndex);
    });
  });

  it('should handle Token2022 tokens like PYUSD', async () => {
    // PYUSD is a Token2022 token - the fix uses fetchAllMint which supports both Token and Token2022
    const pyusdPoolAddress = '9tXiuRRw7kbejLhZXtxDxYs2REe43uH2e7k1kocgdM9B';
    const pyusdMint = '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo';
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    // Mock whirlpool data with PYUSD (Token2022) and USDC (Token) pair
    const mockPyusdWhirlpool = {
      tokenMintA: pyusdMint,
      tokenMintB: usdcMint,
      tokenVaultA: '7jaiZR5Sk8hdYN9MxTpczTcwbWpb5WEoxSANuUwveuat',
      tokenVaultB: '3YQm7ujtXWJU2e9jhp2QGHpnn1ShXn12QjvzMvDgabpX',
      tickSpacing: 1,
      feeRate: 100, // 0.01%
      protocolFeeRate: 1300, // 0.13%
      tickCurrentIndex: 0,
      liquidity: 43569222763129181n,
      sqrtPrice: 18447148653206777165n,
    };

    const mockPyusdApiPoolInfo = {
      address: pyusdPoolAddress,
      baseTokenAddress: pyusdMint,
      quoteTokenAddress: usdcMint,
      binStep: 1,
      feePct: 0.01,
      price: 1.0,
      baseTokenAmount: 16826537.332925,
      quoteTokenAmount: 14220697.597852,
      activeBinId: 0,
      liquidity: '43569222763129181',
      sqrtPrice: '18447148653206777165',
      tvlUsdc: 31045721.31,
      protocolFeeRate: 0.13,
      yieldOverTvl: 0.00000817197170889726,
    };

    const mockOrca = {
      getWhirlpool: jest.fn().mockResolvedValue(mockPyusdWhirlpool),
      getPoolInfo: jest.fn().mockResolvedValue(mockPyusdApiPoolInfo),
      solanaKitRpc: {},
      deployment: { programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' },
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    // fetchAllMint handles both Token and Token2022 programs
    // PYUSD has 6 decimals, USDC has 6 decimals
    fetchAllMintMock.mockResolvedValue([
      { data: { decimals: 6 } }, // PYUSD (Token2022)
      { data: { decimals: 6 } }, // USDC (Token)
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        poolAddress: pyusdPoolAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toHaveProperty('address', pyusdPoolAddress);
    expect(body).toHaveProperty('baseTokenAddress', pyusdMint);
    expect(body).toHaveProperty('quoteTokenAddress', usdcMint);
    expect(Number(body.feePct)).toBe(0.01);
    expect(body).toHaveProperty('binStep', 1);
  });
});

import { FastifyInstance } from 'fastify';

import { getPositionsOwned } from '../../../../src/connectors/pancakeswap/clmm-routes/positionsOwned';

// ─── Shared mock data ────────────────────────────────────────────────────────

const MOCK_NETWORK = 'bsc';
const MOCK_WALLET = '0xWallet';
const MOCK_POOL_ADDRESS = '0xPool';

const mockToken0 = {
  address: '0xaaa0000000000000000000000000000000000000',
  symbol: 'USDT',
  decimals: 18,
};
const mockToken1 = {
  address: '0xbbb0000000000000000000000000000000000000',
  symbol: 'WBNB',
  decimals: 18,
};

// isBaseToken0 = token0.address < token1.address => 0xaaa... < 0xbbb... => true

const makePositionDetails = (liquidity: number) => ({
  liquidity: { eq: (n: number) => liquidity === n, toString: () => String(liquidity) },
  fee: 500,
  tickLower: -100,
  tickUpper: 100,
  token0: mockToken0.address,
  token1: mockToken1.address,
  tokensOwed0: { toString: () => '0' },
  tokensOwed1: { toString: () => '0' },
});

const mockPool = {
  token0Price: { toSignificant: () => '1.5' },
  token0: mockToken0,
  token1: mockToken1,
  tickCurrent: 0,
};

const mockPosition = {
  amount0: { quotient: { toString: () => '1000000000000000000' } },
  amount1: { quotient: { toString: () => '500000000000000000' } },
};

// ─── Module mocks ────────────────────────────────────────────────────────────

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap', () => ({
  Pancakeswap: {
    getInstance: jest.fn().mockResolvedValue({
      getFirstWalletAddress: jest.fn().mockResolvedValue('0xWallet'),
      getToken: jest.fn().mockImplementation((addr: string) => {
        if (addr === '0xaaa0000000000000000000000000000000000000') {
          return { address: '0xaaa0000000000000000000000000000000000000', symbol: 'USDT', decimals: 18 };
        }
        return { address: '0xbbb0000000000000000000000000000000000000', symbol: 'WBNB', decimals: 18 };
      }),
      getV3Pool: jest.fn().mockResolvedValue({
        token0Price: { toSignificant: () => '1.5' },
        token0: { address: '0xaaa0000000000000000000000000000000000000', symbol: 'USDT', decimals: 18 },
        token1: { address: '0xbbb0000000000000000000000000000000000000', symbol: 'WBNB', decimals: 18 },
        tickCurrent: 0,
      }),
    }),
  },
}));

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.contracts', () => ({
  POSITION_MANAGER_ABI: [],
  getPancakeswapV3NftManagerAddress: jest.fn().mockReturnValue('0xNftManager'),
  getPancakeswapV3PoolDeployerAddress: jest.fn().mockReturnValue('0xDeployer'),
}));

jest.mock('@pancakeswap/v3-sdk', () => ({
  computePoolAddress: jest.fn().mockReturnValue('0xPool'),
  tickToPrice: jest.fn().mockReturnValue({ toSignificant: () => '1.0' }),
  Position: jest.fn().mockImplementation(() => mockPosition),
}));

const mockPositionManagerFns: Record<string, jest.Mock> = {
  balanceOf: jest.fn(),
  tokenOfOwnerByIndex: jest.fn(),
  positions: jest.fn(),
};

jest.mock('@ethersproject/contracts', () => ({
  Contract: jest.fn().mockImplementation(() => ({
    balanceOf: mockPositionManagerFns.balanceOf,
    tokenOfOwnerByIndex: mockPositionManagerFns.tokenOfOwnerByIndex,
    positions: mockPositionManagerFns.positions,
  })),
}));

jest.mock('../../../../src/chains/ethereum/ethereum', () => ({
  Ethereum: {
    getInstance: jest.fn().mockResolvedValue({ provider: {} }),
  },
}));

jest.mock('../../../../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.utils', () => ({
  formatTokenAmount: jest.fn().mockImplementation((raw: string) => parseFloat(raw) / 1e18),
}));

// ─── Fastify stub ────────────────────────────────────────────────────────────

const mockFastify = {
  httpErrors: { badRequest: (msg: string) => Object.assign(new Error(msg), { statusCode: 400 }) },
} as unknown as FastifyInstance;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupTwoPositions(liquidities: [number, number]) {
  mockPositionManagerFns.balanceOf.mockResolvedValue({ toNumber: () => 2 });
  mockPositionManagerFns.tokenOfOwnerByIndex
    .mockResolvedValueOnce({ toString: () => '1' })
    .mockResolvedValueOnce({ toString: () => '2' });
  mockPositionManagerFns.positions
    .mockResolvedValueOnce(makePositionDetails(liquidities[0]))
    .mockResolvedValueOnce(makePositionDetails(liquidities[1]));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getPositionsOwned — activeOnly filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty array when wallet has no positions', async () => {
    mockPositionManagerFns.balanceOf.mockResolvedValue({ toNumber: () => 0 });

    const result = await getPositionsOwned(mockFastify, MOCK_NETWORK, MOCK_WALLET);
    expect(result).toEqual([]);
  });

  it('includes zero-liquidity positions when activeOnly=false (default)', async () => {
    setupTwoPositions([100, 0]);

    const result = await getPositionsOwned(mockFastify, MOCK_NETWORK, MOCK_WALLET, false);
    expect(result).toHaveLength(2);
  });

  it('filters out zero-liquidity positions when activeOnly=true', async () => {
    setupTwoPositions([100, 0]);

    const result = await getPositionsOwned(mockFastify, MOCK_NETWORK, MOCK_WALLET, true);
    expect(result).toHaveLength(1);
  });

  it('returns all positions when all have liquidity and activeOnly=true', async () => {
    setupTwoPositions([100, 200]);

    const result = await getPositionsOwned(mockFastify, MOCK_NETWORK, MOCK_WALLET, true);
    expect(result).toHaveLength(2);
  });

  it('uses address ordering (not symbol) to determine isBaseToken0', async () => {
    setupTwoPositions([100, 0]);

    const result = await getPositionsOwned(mockFastify, MOCK_NETWORK, MOCK_WALLET, false);
    // token0.address (0xaaa) < token1.address (0xbbb) => isBaseToken0 = true
    // so baseTokenAddress should be token0.address
    expect(result[0].baseTokenAddress).toBe(mockToken0.address);
    expect(result[0].quoteTokenAddress).toBe(mockToken1.address);
  });
});

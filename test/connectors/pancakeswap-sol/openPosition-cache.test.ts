/**
 * Tests for position cache integration after opening a position
 * PancakeSwap-Sol uses direct RPC calls instead of an SDK
 */

// Mock dependencies
jest.mock('../../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock quotePosition
jest.mock('../../../src/connectors/pancakeswap-sol/clmm-routes/quotePosition', () => ({
  quotePosition: jest.fn().mockResolvedValue({
    baseLimited: true,
    baseTokenAmount: 1.5,
    quoteTokenAmount: 150,
    baseTokenAmountMax: 1.6,
    quoteTokenAmountMax: 160,
  }),
}));

// Mock buildOpenPositionTransaction
const mockPositionNftMint = {
  publicKey: {
    toString: jest.fn().mockReturnValue('position123'),
  },
};

jest.mock('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions', () => ({
  buildOpenPositionTransaction: jest.fn().mockResolvedValue({
    transaction: {
      sign: jest.fn(),
      serialize: jest.fn().mockReturnValue(Buffer.from('mock-transaction')),
    },
    positionNftMint: mockPositionNftMint,
  }),
}));

// Mock pancakeswap-sol.parser
jest.mock('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser', () => ({
  priceToTick: jest.fn((price: number) => Math.floor(Math.log(price) * 100)),
  roundTickToSpacing: jest.fn((tick: number, spacing: number) => Math.floor(tick / spacing) * spacing),
  parsePoolTickSpacing: jest.fn().mockReturnValue(10),
}));

// Mock position cache
const mockPositionCache = {
  set: jest.fn(),
  get: jest.fn(),
  keys: jest.fn().mockReturnValue([]),
};

const mockSolana = {
  getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
  getToken: jest.fn().mockImplementation((address: string) => {
    if (address === 'So11111111111111111111111111111111111111112') {
      return Promise.resolve({ address, symbol: 'SOL', decimals: 9 });
    }
    return Promise.resolve({ address, symbol: 'USDC', decimals: 6 });
  }),
  getWallet: jest.fn().mockResolvedValue({
    publicKey: {
      toString: jest.fn().mockReturnValue('wallet123'),
    },
  }),
  estimateGasPrice: jest.fn().mockResolvedValue(0.000001), // 1 microlamport per CU
  simulateWithErrorHandling: jest.fn().mockResolvedValue(undefined),
  sendAndConfirmRawTransaction: jest.fn(),
  extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
    balanceChanges: [-1.5, -150],
  }),
  fetchPositionsForWallet: jest.fn().mockResolvedValue([
    {
      connector: 'pancakeswap-sol',
      positionId: 'position123',
      poolAddress: '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN',
      baseToken: 'So11111111111111111111111111111111111111112',
      quoteToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      liquidity: 151.5,
      address: 'position123',
      baseTokenAmount: 1.5,
      quoteTokenAmount: 150,
    },
  ]),
  connection: {
    getAccountInfo: jest.fn().mockResolvedValue({
      data: Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 10]), // Mock pool data with tick spacing
    }),
  },
};

const mockPancakeswapSol = {
  getClmmPoolInfo: jest.fn().mockResolvedValue({
    price: 100,
    baseTokenAddress: 'So11111111111111111111111111111111111111112',
    quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    binStep: 10,
    feePct: 0.25,
  }),
};

// Mock PositionsService
const mockPositionsService = {
  trackPositions: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../../src/services/positions-service', () => ({
  PositionsService: {
    getInstance: jest.fn().mockReturnValue(mockPositionsService),
  },
}));

jest.mock('../../../src/chains/solana/solana', () => ({
  Solana: {
    getInstance: jest.fn().mockResolvedValue(mockSolana),
    getWalletAddressExample: jest.fn().mockResolvedValue('5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj'),
  },
}));

jest.mock('../../../src/connectors/pancakeswap-sol/pancakeswap-sol', () => ({
  PancakeswapSol: {
    getInstance: jest.fn().mockResolvedValue(mockPancakeswapSol),
  },
}));

describe('Position Cache Integration - PancakeSwap-Sol CLMM', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup successful transaction confirmation
    mockSolana.sendAndConfirmRawTransaction.mockResolvedValue({
      confirmed: true,
      signature: 'sig123',
      txData: {
        meta: {
          fee: 5000,
        },
      },
    });
  });

  it('should refresh position cache after successfully opening a position', async () => {
    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN'; // Real SOL/USDC pool

    // Import openPosition function
    const { openPosition } = await import('../../../src/connectors/pancakeswap-sol/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any, // fastify instance
      'mainnet-beta',
      walletAddress,
      poolAddress,
      95, // lowerPrice
      105, // upperPrice
      1.5, // baseTokenAmount
      undefined, // quoteTokenAmount
      1, // slippagePct
    );

    // Verify position was opened successfully
    expect(result.status).toBe(1); // CONFIRMED
    expect(result.signature).toBe('sig123');
    expect(result.data?.positionAddress).toBe('position123');

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify position cache was accessed
    expect(mockSolana.getPositionCache).toHaveBeenCalled();

    // Verify PositionsService.trackPositions was called to refresh the wallet's positions
    expect(mockPositionsService.trackPositions).toHaveBeenCalledWith(
      [walletAddress],
      mockPositionCache,
      expect.any(Function),
    );
  });

  it('should not refresh cache if position cache is not enabled', async () => {
    // Disable position cache
    mockSolana.getPositionCache.mockReturnValueOnce(undefined);

    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN'; // Real SOL/USDC pool

    const { openPosition } = await import('../../../src/connectors/pancakeswap-sol/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      poolAddress,
      95,
      105,
      1.5,
      undefined,
      1,
    );

    expect(result.status).toBe(1);

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify no position tracking occurred
    expect(mockPositionsService.trackPositions).not.toHaveBeenCalled();
  });

  it('should not refresh cache if transaction is pending', async () => {
    // Mock pending transaction
    mockSolana.sendAndConfirmRawTransaction.mockResolvedValueOnce({
      confirmed: false,
      signature: 'sig123',
      txData: null,
    });

    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN'; // Real SOL/USDC pool

    const { openPosition } = await import('../../../src/connectors/pancakeswap-sol/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      poolAddress,
      95,
      105,
      1.5,
      undefined,
      1,
    );

    // Transaction is pending
    expect(result.status).toBe(0);

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify no position tracking occurred for pending transaction
    expect(mockPositionsService.trackPositions).not.toHaveBeenCalled();
  });

  it('should handle cache refresh errors gracefully', async () => {
    // Mock PositionsService error
    mockPositionsService.trackPositions.mockRejectedValueOnce(new Error('RPC error'));

    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN'; // Real SOL/USDC pool

    const { openPosition } = await import('../../../src/connectors/pancakeswap-sol/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      poolAddress,
      95,
      105,
      1.5,
      undefined,
      1,
    );

    // Should still succeed - cache refresh is non-blocking
    expect(result.status).toBe(1);
    expect(result.data?.positionAddress).toBe('position123');

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify refresh was attempted even though it failed
    expect(mockPositionsService.trackPositions).toHaveBeenCalled();
  });

  it('should include newly opened position in cache after refresh', async () => {
    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN'; // Real SOL/USDC pool
    const positionAddress = 'position123';

    // Mock the callback that will be passed to trackPositions - do this BEFORE importing
    mockPositionsService.trackPositions.mockImplementationOnce(async (wallets, cache, getPositions) => {
      const positions = await getPositions(wallets[0]);
      // Simulate what PositionsService does - stores positions in cache
      cache.set(wallets[0], { positions });
      return undefined;
    });

    const { openPosition } = await import('../../../src/connectors/pancakeswap-sol/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      poolAddress,
      95,
      105,
      1.5,
      undefined,
      1,
    );

    expect(result.status).toBe(1);

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify trackPositions was called
    expect(mockPositionsService.trackPositions).toHaveBeenCalled();

    // Verify position cache received the wallet's positions
    expect(mockPositionCache.set).toHaveBeenCalled();
  });
});

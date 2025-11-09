/**
 * Tests for position cache integration after opening a position
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
jest.mock('../../../src/connectors/raydium/clmm-routes/quotePosition', () => ({
  quotePosition: jest.fn().mockResolvedValue({
    baseLimited: true,
    baseTokenAmount: 1.5,
    quoteTokenAmount: 150,
    baseTokenAmountMax: 1.6,
    quoteTokenAmountMax: 160,
  }),
}));

// Mock position cache - namespace to avoid collisions
const RaydiumMocks = {
  mockPositionCache: {
    set: jest.fn(),
    get: jest.fn(),
    keys: jest.fn().mockReturnValue([]),
  },
  mockSolana: {} as any,
  mockRaydium: {} as any,
  mockPositionsService: {
    trackPositions: jest.fn().mockResolvedValue(undefined),
  },
};

// Initialize mockSolana
RaydiumMocks.mockSolana = {
  getPositionCache: jest.fn().mockReturnValue(RaydiumMocks.mockPositionCache),
  getToken: jest.fn().mockResolvedValue({
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    decimals: 9,
  }),
  estimateGasPrice: jest.fn().mockResolvedValue(0.000001), // 1 microlamport per CU
  simulateWithErrorHandling: jest.fn().mockResolvedValue(undefined),
  sendAndConfirmRawTransaction: jest.fn(),
  extractClmmBalanceChanges: jest.fn().mockResolvedValue({
    baseTokenChange: -1.5,
    quoteTokenChange: -150,
    rent: 0.002,
  }),
  fetchPositionsForWallet: jest.fn().mockResolvedValue([
    {
      connector: 'raydium',
      positionId: 'position123',
      poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      baseToken: 'So11111111111111111111111111111111111111112',
      quoteToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      liquidity: 151.5,
      address: 'position123',
      baseTokenAmount: 1.5,
      quoteTokenAmount: 150,
    },
  ]),
  connection: {
    getAccountInfo: jest.fn(),
  },
};

// Initialize mockRaydium
RaydiumMocks.mockRaydium = {
  prepareWallet: jest.fn().mockResolvedValue({
    wallet: { publicKey: { toBase58: () => 'wallet123' } },
    isHardwareWallet: false,
  }),
  getClmmPoolfromAPI: jest.fn().mockResolvedValue([
    {
      id: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      mintA: { address: 'So11111111111111111111111111111111111111112', decimals: 9 },
      mintB: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
      price: 100,
      config: {
        tickSpacing: 10,
      },
      tickCurrent: 100,
      programId: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    },
    { id: 'pool-keys' },
  ]),
  getClmmPoolfromRPC: jest.fn().mockResolvedValue({
    currentPrice: 100,
  }),
  signTransaction: jest.fn().mockImplementation((txn) => Promise.resolve(txn)),
  getPositionInfo: jest.fn().mockResolvedValue({
    address: 'position123',
    poolAddress: 'pool123',
    baseTokenAddress: 'So11111111111111111111111111111111111112',
    quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    lowerPrice: 95,
    upperPrice: 105,
    price: 100,
    baseTokenAmount: 1.5,
    quoteTokenAmount: 150,
    baseFeeAmount: 0,
    quoteFeeAmount: 0,
    lowerBinId: -1000,
    upperBinId: 1000,
  }),
  raydiumSDK: {
    clmm: {
      openPositionFromBase: jest.fn().mockResolvedValue({
        transaction: {
          serialize: jest.fn().mockReturnValue(Buffer.from('mock-transaction')),
        },
        extInfo: {
          nftMint: { toBase58: () => 'position123' },
        },
      }),
    },
  },
};

jest.mock('../../../src/services/positions-service', () => ({
  PositionsService: {
    getInstance: jest.fn(() => RaydiumMocks.mockPositionsService),
  },
}));

jest.mock('../../../src/chains/solana/solana', () => ({
  Solana: {
    getInstance: jest.fn(() => Promise.resolve(RaydiumMocks.mockSolana)),
    getWalletAddressExample: jest.fn().mockResolvedValue('5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj'),
  },
}));

jest.mock('../../../src/connectors/raydium/raydium', () => ({
  Raydium: {
    getInstance: jest.fn(() => Promise.resolve(RaydiumMocks.mockRaydium)),
  },
}));

describe('Position Cache Integration - Raydium CLMM', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup successful transaction confirmation
    RaydiumMocks.mockSolana.sendAndConfirmRawTransaction.mockResolvedValue({
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
    const poolAddress = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

    // Import openPosition function
    const { openPosition } = await import('../../../src/connectors/raydium/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any, // fastify instance
      'mainnet-beta',
      walletAddress,
      95, // lowerPrice
      105, // upperPrice
      poolAddress,
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
    expect(RaydiumMocks.mockSolana.getPositionCache).toHaveBeenCalled();

    // Verify PositionsService.trackPositions was called to refresh the wallet's positions
    expect(RaydiumMocks.mockPositionsService.trackPositions).toHaveBeenCalledWith(
      [walletAddress],
      RaydiumMocks.mockPositionCache,
      expect.any(Function),
    );
  });

  it('should not refresh cache if position cache is not enabled', async () => {
    // Disable position cache
    RaydiumMocks.mockSolana.getPositionCache.mockReturnValueOnce(undefined);

    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

    const { openPosition } = await import('../../../src/connectors/raydium/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      95,
      105,
      poolAddress,
      1.5,
      undefined,
      1,
    );

    expect(result.status).toBe(1);

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify no position tracking occurred
    expect(RaydiumMocks.mockPositionsService.trackPositions).not.toHaveBeenCalled();
  });

  it('should not refresh cache if transaction is pending', async () => {
    // Mock pending transaction
    RaydiumMocks.mockSolana.sendAndConfirmRawTransaction.mockResolvedValueOnce({
      confirmed: false,
      signature: 'sig123',
      txData: null,
    });

    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

    const { openPosition } = await import('../../../src/connectors/raydium/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      95,
      105,
      poolAddress,
      1.5,
      undefined,
      1,
    );

    // Transaction is pending
    expect(result.status).toBe(0);

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify no position tracking occurred for pending transaction
    expect(RaydiumMocks.mockPositionsService.trackPositions).not.toHaveBeenCalled();
  });

  it('should handle cache refresh errors gracefully', async () => {
    // Mock PositionsService error
    RaydiumMocks.mockPositionsService.trackPositions.mockRejectedValueOnce(new Error('RPC error'));

    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

    const { openPosition } = await import('../../../src/connectors/raydium/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      95,
      105,
      poolAddress,
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
    expect(RaydiumMocks.mockPositionsService.trackPositions).toHaveBeenCalled();
  });

  it('should include newly opened position in cache after refresh', async () => {
    const walletAddress = '5xot9PVkphiX2adznghwrAuxGs2zeWisNSxMW6hU6Hkj';
    const poolAddress = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
    const positionAddress = 'position123';

    // Mock the callback that will be passed to trackPositions - do this BEFORE importing
    RaydiumMocks.mockPositionsService.trackPositions.mockImplementationOnce(async (wallets, cache, getPositions) => {
      const positions = await getPositions(wallets[0]);
      // Simulate what PositionsService does - stores positions in cache
      cache.set(wallets[0], { positions });
      return undefined;
    });

    const { openPosition } = await import('../../../src/connectors/raydium/clmm-routes/openPosition');

    const result = await openPosition(
      {} as any,
      'mainnet-beta',
      walletAddress,
      95,
      105,
      poolAddress,
      1.5,
      undefined,
      1,
    );

    expect(result.status).toBe(1);

    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify trackPositions was called
    expect(RaydiumMocks.mockPositionsService.trackPositions).toHaveBeenCalled();

    // Verify position cache received the wallet's positions
    expect(RaydiumMocks.mockPositionCache.set).toHaveBeenCalled();
  });
});

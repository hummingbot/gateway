const { test, describe, expect, beforeEach } = require('@jest/globals');
const JSBI = require('jsbi');
const { Token } = require('@uniswap/sdk-core');
const { FeeAmount, Pool } = require('@uniswap/v3-sdk');

// Create a mock implementation of the tick data provider
const mockTickDataProvider = {
  async getTick(index) {
    return {
      index,
      liquidityNet: JSBI.BigInt(0),
      liquidityGross: JSBI.BigInt(0)
    };
  },
  async nextInitializedTickWithinOneWord(tick, lte, tickSpacing) {
    const nextTick = lte ? tick - tickSpacing : tick + tickSpacing;
    return [nextTick, false];
  }
};

// Constants for testing
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'; // WETH on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const FEE = FeeAmount.LOW; // 0.05%
const POOL_ADDRESS = '0xd0b53d9277642d899df5c87a3966a349a798f224'; // Known WETH-USDC pool on Base

describe('Uniswap Tick Data Provider Tests', () => {
  // Create token instances for testing
  const weth = new Token(8453, WETH_ADDRESS, 18, 'WETH', 'Wrapped Ether');
  const usdc = new Token(8453, USDC_ADDRESS, 6, 'USDC', 'USD Coin');
  
  // Mock the required pool data
  // Use values that meet the SDK's price bounds requirements
  const mockPoolData = {
    // This value is within the allowed price range
    sqrtPriceX96: JSBI.BigInt('79228162514264337593543950336'),
    liquidity: JSBI.BigInt('15000000000000000'),
    tick: 0, // Use a safe tick value
    fee: FeeAmount.LOW
  };

  describe('Pool with tick data provider', () => {
    test('creates a V3 pool with a working tick data provider', () => {
      // Create a pool instance with our tick data provider
      const pool = new Pool(
        weth,
        usdc,
        mockPoolData.fee,
        mockPoolData.sqrtPriceX96.toString(),
        mockPoolData.liquidity.toString(),
        mockPoolData.tick,
        mockTickDataProvider
      );

      // Test that the pool instance has the expected properties
      expect(pool).toBeDefined();
      expect(pool.token0).toBeDefined();
      expect(pool.token1).toBeDefined();
      expect(pool.fee).toBe(mockPoolData.fee);
      expect(pool.tickCurrent).toBe(mockPoolData.tick);
      
      // Verify the tick data provider functionality
      expect(typeof pool.tickDataProvider.getTick).toBe('function');
      expect(typeof pool.tickDataProvider.nextInitializedTickWithinOneWord).toBe('function');
    });

    test('tick data provider returns the expected formats', async () => {
      // Create a pool instance with our tick data provider
      const pool = new Pool(
        weth,
        usdc,
        mockPoolData.fee,
        mockPoolData.sqrtPriceX96.toString(),
        mockPoolData.liquidity.toString(),
        mockPoolData.tick,
        mockTickDataProvider
      );

      // Test the tick data provider methods
      const testTick = 12345;
      const tickInfo = await pool.tickDataProvider.getTick(testTick);
      expect(tickInfo).toHaveProperty('index', testTick);
      expect(tickInfo).toHaveProperty('liquidityNet');
      expect(tickInfo).toHaveProperty('liquidityGross');

      // Test going up (lte = false)
      const [nextTickUp, initializedUp] = await pool.tickDataProvider.nextInitializedTickWithinOneWord(
        testTick, 
        false, 
        pool.tickSpacing
      );
      expect(nextTickUp).toBe(testTick + pool.tickSpacing);
      expect(initializedUp).toBe(false);
      
      // Test going down (lte = true)
      const [nextTickDown, initializedDown] = await pool.tickDataProvider.nextInitializedTickWithinOneWord(
        testTick, 
        true, 
        pool.tickSpacing
      );
      expect(nextTickDown).toBe(testTick - pool.tickSpacing);
      expect(initializedDown).toBe(false);
    });
  });
});
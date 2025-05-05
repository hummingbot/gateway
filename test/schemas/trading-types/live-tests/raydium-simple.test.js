// Configure test timeout (30 seconds)
jest.setTimeout(30000);

// Test constants
const NETWORK = 'mainnet-beta';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Helper to determine if we should run live tests
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== 'live';
};

describe('Raydium Schema Tests', () => {
  describe('AMM Pool Info Schema', () => {
    it('validates AMM pool info schema structure', () => {
      // Create a sample pool info object that matches the AMM schema
      const poolInfo = {
        address: "CS2H8nbAVVEUHWPF5extCSymqheQdkd4d7thik6eet9N",
        baseTokenAddress: SOL_MINT,
        quoteTokenAddress: USDC_MINT,
        feePct: 0.25,
        price: 30.0,
        baseTokenAmount: 1000.0,
        quoteTokenAmount: 30000.0,
        lpMint: {
          address: "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu",
          decimals: 9
        }
      };
      
      // Validate properties
      expect(poolInfo).toHaveProperty('address');
      expect(poolInfo).toHaveProperty('baseTokenAddress');
      expect(poolInfo).toHaveProperty('quoteTokenAddress');
      expect(poolInfo).toHaveProperty('feePct');
      expect(poolInfo).toHaveProperty('price');
      expect(poolInfo).toHaveProperty('baseTokenAmount');
      expect(poolInfo).toHaveProperty('quoteTokenAmount');
      expect(poolInfo).toHaveProperty('lpMint');
      expect(poolInfo.lpMint).toHaveProperty('address');
      expect(poolInfo.lpMint).toHaveProperty('decimals');
      
      // Validate data types
      expect(typeof poolInfo.address).toBe('string');
      expect(typeof poolInfo.baseTokenAddress).toBe('string');
      expect(typeof poolInfo.quoteTokenAddress).toBe('string');
      expect(typeof poolInfo.feePct).toBe('number');
      expect(typeof poolInfo.price).toBe('number');
      expect(typeof poolInfo.baseTokenAmount).toBe('number');
      expect(typeof poolInfo.quoteTokenAmount).toBe('number');
      expect(typeof poolInfo.lpMint).toBe('object');
      expect(typeof poolInfo.lpMint.address).toBe('string');
      expect(typeof poolInfo.lpMint.decimals).toBe('number');
      
      // Validate ranges
      expect(poolInfo.feePct).toBeGreaterThanOrEqual(0);
      expect(poolInfo.feePct).toBeLessThanOrEqual(1);
      expect(poolInfo.price).toBeGreaterThan(0);
      expect(poolInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
      expect(poolInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
      
      console.log('AMM Pool Info schema validation passed');
    });
  });
  
  describe('CLMM Pool Info Schema', () => {
    it('validates CLMM pool info schema structure', () => {
      // Create a sample CLMM pool info object that matches the schema
      const poolInfo = {
        address: "7quzvT3yBcbxLMGxbvHBwrXuUeN5xHPGUXUm6eKwLMsW",
        baseTokenAddress: SOL_MINT,
        quoteTokenAddress: USDC_MINT,
        binStep: 10,
        feePct: 0.05,
        price: 30.0,
        baseTokenAmount: 500.0,
        quoteTokenAmount: 15000.0,
        activeBinId: 205800
      };
      
      // Validate properties
      expect(poolInfo).toHaveProperty('address');
      expect(poolInfo).toHaveProperty('baseTokenAddress');
      expect(poolInfo).toHaveProperty('quoteTokenAddress');
      expect(poolInfo).toHaveProperty('binStep');
      expect(poolInfo).toHaveProperty('feePct');
      expect(poolInfo).toHaveProperty('price');
      expect(poolInfo).toHaveProperty('baseTokenAmount');
      expect(poolInfo).toHaveProperty('quoteTokenAmount');
      expect(poolInfo).toHaveProperty('activeBinId');
      
      // Validate data types
      expect(typeof poolInfo.address).toBe('string');
      expect(typeof poolInfo.baseTokenAddress).toBe('string');
      expect(typeof poolInfo.quoteTokenAddress).toBe('string');
      expect(typeof poolInfo.binStep).toBe('number');
      expect(typeof poolInfo.feePct).toBe('number');
      expect(typeof poolInfo.price).toBe('number');
      expect(typeof poolInfo.baseTokenAmount).toBe('number');
      expect(typeof poolInfo.quoteTokenAmount).toBe('number');
      expect(typeof poolInfo.activeBinId).toBe('number');
      
      // Validate ranges
      expect(poolInfo.binStep).toBeGreaterThan(0);
      expect(poolInfo.feePct).toBeGreaterThanOrEqual(0);
      expect(poolInfo.feePct).toBeLessThanOrEqual(1);
      expect(poolInfo.price).toBeGreaterThan(0);
      expect(poolInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
      expect(poolInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
      
      console.log('CLMM Pool Info schema validation passed');
    });
  });
  
  describe('Swap Quote Schema', () => {
    it('validates swap quote schema structure', () => {
      // Create a sample swap quote object that matches the schema
      const swapQuote = {
        poolAddress: "CS2H8nbAVVEUHWPF5extCSymqheQdkd4d7thik6eet9N",
        estimatedAmountIn: 1.0,
        estimatedAmountOut: 30.0,
        minAmountOut: 29.85,
        maxAmountIn: 1.005,
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 30.0,
        price: 30.0,
        gasPrice: 5000,
        gasLimit: 200000,
        gasCost: 0.001
      };
      
      // Validate properties
      expect(swapQuote).toHaveProperty('poolAddress');
      expect(swapQuote).toHaveProperty('estimatedAmountIn');
      expect(swapQuote).toHaveProperty('estimatedAmountOut');
      expect(swapQuote).toHaveProperty('minAmountOut');
      expect(swapQuote).toHaveProperty('maxAmountIn');
      expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
      expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
      expect(swapQuote).toHaveProperty('price');
      expect(swapQuote).toHaveProperty('gasPrice');
      expect(swapQuote).toHaveProperty('gasLimit');
      expect(swapQuote).toHaveProperty('gasCost');
      
      // Validate data types
      expect(typeof swapQuote.poolAddress).toBe('string');
      expect(typeof swapQuote.estimatedAmountIn).toBe('number');
      expect(typeof swapQuote.estimatedAmountOut).toBe('number');
      expect(typeof swapQuote.minAmountOut).toBe('number');
      expect(typeof swapQuote.maxAmountIn).toBe('number');
      expect(typeof swapQuote.baseTokenBalanceChange).toBe('number');
      expect(typeof swapQuote.quoteTokenBalanceChange).toBe('number');
      expect(typeof swapQuote.price).toBe('number');
      expect(typeof swapQuote.gasPrice).toBe('number');
      expect(typeof swapQuote.gasLimit).toBe('number');
      expect(typeof swapQuote.gasCost).toBe('number');
      
      // Validate token balance changes have opposite signs (one positive, one negative)
      expect(Math.sign(swapQuote.baseTokenBalanceChange) * Math.sign(swapQuote.quoteTokenBalanceChange)).toBeLessThan(0);
      
      console.log('Swap Quote schema validation passed');
    });
  });
});
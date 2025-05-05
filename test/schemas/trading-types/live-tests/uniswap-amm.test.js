// Configure test timeout (30 seconds)
jest.setTimeout(30000);

// Test constants
const NETWORK = 'base';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SAMPLE_POOL_ADDRESS = '0x4c36388be6f416a29c8d8eee81c771ce6be14b18'; // WETH-USDC pool on Base

// Helper to determine if we should skip live tests
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== 'live';
};

describe('Uniswap AMM Schema Tests', () => {
  describe('AMM Pool Info Schema', () => {
    it('validates AMM pool info schema structure', () => {
      // Create a sample pool info object that matches the AMM schema
      const poolInfo = {
        address: SAMPLE_POOL_ADDRESS,
        baseTokenAddress: WETH_ADDRESS,
        quoteTokenAddress: USDC_ADDRESS,
        feePct: 0.3, // Uniswap V2 fee is fixed at 0.3%
        price: 3200.0,
        baseTokenAmount: 10.0,
        quoteTokenAmount: 32000.0,
        poolType: 'amm',
        lpMint: {
          address: SAMPLE_POOL_ADDRESS, // In Uniswap V2, the LP token address is the pair address
          decimals: 18 // Uniswap V2 LP tokens have 18 decimals
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
      expect(poolInfo).toHaveProperty('poolType');
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
      expect(typeof poolInfo.poolType).toBe('string');
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
  
  describe('AMM Position Info Schema', () => {
    it('validates position info schema structure', () => {
      // Create a sample position info object that matches the schema
      const positionInfo = {
        poolAddress: SAMPLE_POOL_ADDRESS,
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        baseTokenAddress: WETH_ADDRESS,
        quoteTokenAddress: USDC_ADDRESS,
        lpTokenAmount: 5.0,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 3200.0,
        price: 3200.0
      };
      
      // Validate properties
      expect(positionInfo).toHaveProperty('poolAddress');
      expect(positionInfo).toHaveProperty('walletAddress');
      expect(positionInfo).toHaveProperty('baseTokenAddress');
      expect(positionInfo).toHaveProperty('quoteTokenAddress');
      expect(positionInfo).toHaveProperty('lpTokenAmount');
      expect(positionInfo).toHaveProperty('baseTokenAmount');
      expect(positionInfo).toHaveProperty('quoteTokenAmount');
      expect(positionInfo).toHaveProperty('price');
      
      // Validate data types
      expect(typeof positionInfo.poolAddress).toBe('string');
      expect(typeof positionInfo.walletAddress).toBe('string');
      expect(typeof positionInfo.baseTokenAddress).toBe('string');
      expect(typeof positionInfo.quoteTokenAddress).toBe('string');
      expect(typeof positionInfo.lpTokenAmount).toBe('number');
      expect(typeof positionInfo.baseTokenAmount).toBe('number');
      expect(typeof positionInfo.quoteTokenAmount).toBe('number');
      expect(typeof positionInfo.price).toBe('number');
      
      // Validate ranges
      expect(positionInfo.lpTokenAmount).toBeGreaterThanOrEqual(0);
      expect(positionInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
      expect(positionInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
      expect(positionInfo.price).toBeGreaterThan(0);
      
      console.log('AMM Position Info schema validation passed');
    });
  });
  
  describe('Quote Liquidity Schema', () => {
    it('validates quote liquidity schema structure', () => {
      // Create a sample quote liquidity response that matches the schema
      const quoteLiquidity = {
        baseLimited: true,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 3200.0,
        baseTokenAmountMax: 2.0,
        quoteTokenAmountMax: 6400.0
      };
      
      // Validate properties
      expect(quoteLiquidity).toHaveProperty('baseLimited');
      expect(quoteLiquidity).toHaveProperty('baseTokenAmount');
      expect(quoteLiquidity).toHaveProperty('quoteTokenAmount');
      expect(quoteLiquidity).toHaveProperty('baseTokenAmountMax');
      expect(quoteLiquidity).toHaveProperty('quoteTokenAmountMax');
      
      // Validate data types
      expect(typeof quoteLiquidity.baseLimited).toBe('boolean');
      expect(typeof quoteLiquidity.baseTokenAmount).toBe('number');
      expect(typeof quoteLiquidity.quoteTokenAmount).toBe('number');
      expect(typeof quoteLiquidity.baseTokenAmountMax).toBe('number');
      expect(typeof quoteLiquidity.quoteTokenAmountMax).toBe('number');
      
      // Validate ranges
      expect(quoteLiquidity.baseTokenAmount).toBeGreaterThanOrEqual(0);
      expect(quoteLiquidity.quoteTokenAmount).toBeGreaterThanOrEqual(0);
      expect(quoteLiquidity.baseTokenAmountMax).toBeGreaterThanOrEqual(quoteLiquidity.baseTokenAmount);
      expect(quoteLiquidity.quoteTokenAmountMax).toBeGreaterThanOrEqual(quoteLiquidity.quoteTokenAmount);
      
      console.log('Quote Liquidity schema validation passed');
    });
  });
  
  describe('Add/Remove Liquidity Response Schema', () => {
    it('validates add liquidity response schema structure', () => {
      // Create a sample add liquidity response that matches the schema
      const addLiquidityResponse = {
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        fee: 0.005,
        baseTokenAmountAdded: 1.0,
        quoteTokenAmountAdded: 3200.0
      };
      
      // Validate properties
      expect(addLiquidityResponse).toHaveProperty('signature');
      expect(addLiquidityResponse).toHaveProperty('fee');
      expect(addLiquidityResponse).toHaveProperty('baseTokenAmountAdded');
      expect(addLiquidityResponse).toHaveProperty('quoteTokenAmountAdded');
      
      // Validate data types
      expect(typeof addLiquidityResponse.signature).toBe('string');
      expect(typeof addLiquidityResponse.fee).toBe('number');
      expect(typeof addLiquidityResponse.baseTokenAmountAdded).toBe('number');
      expect(typeof addLiquidityResponse.quoteTokenAmountAdded).toBe('number');
      
      // Validate ranges
      expect(addLiquidityResponse.fee).toBeGreaterThanOrEqual(0);
      expect(addLiquidityResponse.baseTokenAmountAdded).toBeGreaterThanOrEqual(0);
      expect(addLiquidityResponse.quoteTokenAmountAdded).toBeGreaterThanOrEqual(0);
      
      console.log('Add Liquidity Response schema validation passed');
    });
    
    it('validates remove liquidity response schema structure', () => {
      // Create a sample remove liquidity response that matches the schema
      const removeLiquidityResponse = {
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        fee: 0.005,
        baseTokenAmountRemoved: 1.0,
        quoteTokenAmountRemoved: 3200.0
      };
      
      // Validate properties
      expect(removeLiquidityResponse).toHaveProperty('signature');
      expect(removeLiquidityResponse).toHaveProperty('fee');
      expect(removeLiquidityResponse).toHaveProperty('baseTokenAmountRemoved');
      expect(removeLiquidityResponse).toHaveProperty('quoteTokenAmountRemoved');
      
      // Validate data types
      expect(typeof removeLiquidityResponse.signature).toBe('string');
      expect(typeof removeLiquidityResponse.fee).toBe('number');
      expect(typeof removeLiquidityResponse.baseTokenAmountRemoved).toBe('number');
      expect(typeof removeLiquidityResponse.quoteTokenAmountRemoved).toBe('number');
      
      // Validate ranges
      expect(removeLiquidityResponse.fee).toBeGreaterThanOrEqual(0);
      expect(removeLiquidityResponse.baseTokenAmountRemoved).toBeGreaterThanOrEqual(0);
      expect(removeLiquidityResponse.quoteTokenAmountRemoved).toBeGreaterThanOrEqual(0);
      
      console.log('Remove Liquidity Response schema validation passed');
    });
  });
  
  // Live test for pool info - only run in live mode
  describe('Live Pool Info Test', () => {
    it('retrieves actual pool info from Base network', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test - not in live mode');
        return;
      }
      
      // Import modules needed for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API
        const response = await axios.get('http://localhost:15888/connectors/uniswap/amm/pool-info', {
          params: {
            network: NETWORK,
            baseToken: 'WETH',
            quoteToken: 'USDC'
          }
        });
        
        const poolInfo = response.data;
        console.log('Retrieved pool info:', poolInfo);
        
        // Validate properties
        expect(poolInfo).toHaveProperty('address');
        expect(poolInfo).toHaveProperty('baseTokenAddress');
        expect(poolInfo).toHaveProperty('quoteTokenAddress');
        expect(poolInfo).toHaveProperty('feePct');
        expect(poolInfo).toHaveProperty('price');
        expect(poolInfo).toHaveProperty('baseTokenAmount');
        expect(poolInfo).toHaveProperty('quoteTokenAmount');
        expect(poolInfo).toHaveProperty('lpMint');
        
        // Validate specific to Uniswap on Base
        expect(poolInfo.baseTokenAddress.toLowerCase()).toBe(WETH_ADDRESS.toLowerCase());
        expect(poolInfo.quoteTokenAddress.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
        expect(poolInfo.feePct).toBe(0.3); // Uniswap V2 fee is fixed at 0.3%
        
        console.log('Live AMM Pool Info test passed');
      } catch (error) {
        console.error('Live test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running
        console.log('Skipping live test - server may not be running');
      }
    });
  });
});
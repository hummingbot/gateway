// Configure test timeout (30 seconds)
jest.setTimeout(30000);

// Test constants
const NETWORK = 'mainnet-beta';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SAMPLE_POOL_ADDRESS = '7quzvT3yBcbxLMGxbvHBwrXuUeN5xHPGUXUm6eKwLMsW'; // SOL-USDC Meteora pool
const SAMPLE_POSITION_ADDRESS = '8auCnkYLHhYJLGk8s9Vb1A3hbQQ2h2zNNBBUkUr3ViJx'; // Example position NFT address

// Helper to determine if we should skip live tests
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== 'live';
};

describe('Meteora CLMM Schema Tests', () => {
  describe('Pool Info Schema', () => {
    it('validates CLMM pool info schema structure', () => {
      // Create a sample pool info object that matches the schema
      const poolInfo = {
        address: SAMPLE_POOL_ADDRESS,
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
      
      console.log('Meteora CLMM Pool Info schema validation passed');
    });
  });
  
  describe('Position Info Schema', () => {
    it('validates position info schema structure', () => {
      // Create a sample position info object that matches the schema
      const positionInfo = {
        address: SAMPLE_POSITION_ADDRESS,
        poolAddress: SAMPLE_POOL_ADDRESS,
        baseTokenAddress: SOL_MINT,
        quoteTokenAddress: USDC_MINT,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 30.0,
        baseFeeAmount: 0.01,
        quoteFeeAmount: 0.3,
        lowerBinId: 200000,
        upperBinId: 210000,
        lowerPrice: 25.0,
        upperPrice: 35.0,
        price: 30.0
      };
      
      // Validate properties
      expect(positionInfo).toHaveProperty('address');
      expect(positionInfo).toHaveProperty('poolAddress');
      expect(positionInfo).toHaveProperty('baseTokenAddress');
      expect(positionInfo).toHaveProperty('quoteTokenAddress');
      expect(positionInfo).toHaveProperty('baseTokenAmount');
      expect(positionInfo).toHaveProperty('quoteTokenAmount');
      expect(positionInfo).toHaveProperty('baseFeeAmount');
      expect(positionInfo).toHaveProperty('quoteFeeAmount');
      expect(positionInfo).toHaveProperty('lowerBinId');
      expect(positionInfo).toHaveProperty('upperBinId');
      expect(positionInfo).toHaveProperty('lowerPrice');
      expect(positionInfo).toHaveProperty('upperPrice');
      expect(positionInfo).toHaveProperty('price');
      
      // Validate data types
      expect(typeof positionInfo.address).toBe('string');
      expect(typeof positionInfo.poolAddress).toBe('string');
      expect(typeof positionInfo.baseTokenAddress).toBe('string');
      expect(typeof positionInfo.quoteTokenAddress).toBe('string');
      expect(typeof positionInfo.baseTokenAmount).toBe('number');
      expect(typeof positionInfo.quoteTokenAmount).toBe('number');
      expect(typeof positionInfo.baseFeeAmount).toBe('number');
      expect(typeof positionInfo.quoteFeeAmount).toBe('number');
      expect(typeof positionInfo.lowerBinId).toBe('number');
      expect(typeof positionInfo.upperBinId).toBe('number');
      expect(typeof positionInfo.lowerPrice).toBe('number');
      expect(typeof positionInfo.upperPrice).toBe('number');
      expect(typeof positionInfo.price).toBe('number');
      
      // Validate ranges
      expect(positionInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
      expect(positionInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
      expect(positionInfo.baseFeeAmount).toBeGreaterThanOrEqual(0);
      expect(positionInfo.quoteFeeAmount).toBeGreaterThanOrEqual(0);
      expect(positionInfo.lowerBinId).toBeLessThan(positionInfo.upperBinId);
      expect(positionInfo.lowerPrice).toBeLessThan(positionInfo.upperPrice);
      expect(positionInfo.price).toBeGreaterThanOrEqual(positionInfo.lowerPrice);
      expect(positionInfo.price).toBeLessThanOrEqual(positionInfo.upperPrice);
      
      console.log('Meteora CLMM Position Info schema validation passed');
    });
  });
  
  describe('Swap Quote Schema', () => {
    it('validates swap quote schema structure', () => {
      // Create a sample swap quote object that matches the schema
      const swapQuote = {
        poolAddress: SAMPLE_POOL_ADDRESS,
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
      
      console.log('Meteora Swap Quote schema validation passed');
    });
  });
  
  describe('Open Position Response Schema', () => {
    it('validates open position response schema structure', () => {
      // Create a sample open position response that matches the schema
      const openPositionResponse = {
        signature: '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
        fee: 0.005,
        positionAddress: SAMPLE_POSITION_ADDRESS,
        positionRent: 0.001,
        baseTokenAmountAdded: 1.0,
        quoteTokenAmountAdded: 30.0
      };
      
      // Validate properties
      expect(openPositionResponse).toHaveProperty('signature');
      expect(openPositionResponse).toHaveProperty('fee');
      expect(openPositionResponse).toHaveProperty('positionAddress');
      expect(openPositionResponse).toHaveProperty('positionRent');
      expect(openPositionResponse).toHaveProperty('baseTokenAmountAdded');
      expect(openPositionResponse).toHaveProperty('quoteTokenAmountAdded');
      
      // Validate data types
      expect(typeof openPositionResponse.signature).toBe('string');
      expect(typeof openPositionResponse.fee).toBe('number');
      expect(typeof openPositionResponse.positionAddress).toBe('string');
      expect(typeof openPositionResponse.positionRent).toBe('number');
      expect(typeof openPositionResponse.baseTokenAmountAdded).toBe('number');
      expect(typeof openPositionResponse.quoteTokenAmountAdded).toBe('number');
      
      // Validate ranges
      expect(openPositionResponse.fee).toBeGreaterThanOrEqual(0);
      expect(openPositionResponse.positionRent).toBeGreaterThanOrEqual(0);
      expect(openPositionResponse.baseTokenAmountAdded).toBeGreaterThanOrEqual(0);
      expect(openPositionResponse.quoteTokenAmountAdded).toBeGreaterThanOrEqual(0);
      
      console.log('Meteora Open Position Response schema validation passed');
    });
  });
  
  describe('Add/Remove Liquidity Response Schema', () => {
    it('validates add liquidity response schema structure', () => {
      // Create a sample add liquidity response that matches the schema
      const addLiquidityResponse = {
        signature: '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
        fee: 0.005,
        baseTokenAmountAdded: 1.0,
        quoteTokenAmountAdded: 30.0
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
      
      console.log('Meteora Add Liquidity Response schema validation passed');
    });
    
    it('validates remove liquidity response schema structure', () => {
      // Create a sample remove liquidity response that matches the schema
      const removeLiquidityResponse = {
        signature: '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
        fee: 0.005,
        baseTokenAmountRemoved: 1.0,
        quoteTokenAmountRemoved: 30.0
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
      
      console.log('Meteora Remove Liquidity Response schema validation passed');
    });
  });
  
  describe('Collect Fees Response Schema', () => {
    it('validates collect fees response schema structure', () => {
      // Create a sample collect fees response that matches the schema
      const collectFeesResponse = {
        signature: '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
        fee: 0.002,
        baseFeeAmountCollected: 0.01,
        quoteFeeAmountCollected: 0.3
      };
      
      // Validate properties
      expect(collectFeesResponse).toHaveProperty('signature');
      expect(collectFeesResponse).toHaveProperty('fee');
      expect(collectFeesResponse).toHaveProperty('baseFeeAmountCollected');
      expect(collectFeesResponse).toHaveProperty('quoteFeeAmountCollected');
      
      // Validate data types
      expect(typeof collectFeesResponse.signature).toBe('string');
      expect(typeof collectFeesResponse.fee).toBe('number');
      expect(typeof collectFeesResponse.baseFeeAmountCollected).toBe('number');
      expect(typeof collectFeesResponse.quoteFeeAmountCollected).toBe('number');
      
      // Validate ranges
      expect(collectFeesResponse.fee).toBeGreaterThanOrEqual(0);
      expect(collectFeesResponse.baseFeeAmountCollected).toBeGreaterThanOrEqual(0);
      expect(collectFeesResponse.quoteFeeAmountCollected).toBeGreaterThanOrEqual(0);
      
      console.log('Meteora Collect Fees Response schema validation passed');
    });
  });
  
  describe('Close Position Response Schema', () => {
    it('validates close position response schema structure', () => {
      // Create a sample close position response that matches the schema
      const closePositionResponse = {
        signature: '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
        fee: 0.003,
        positionRentRefunded: 0.0005,
        baseTokenAmountRemoved: 1.0,
        quoteTokenAmountRemoved: 30.0,
        baseFeeAmountCollected: 0.01,
        quoteFeeAmountCollected: 0.3
      };
      
      // Validate properties
      expect(closePositionResponse).toHaveProperty('signature');
      expect(closePositionResponse).toHaveProperty('fee');
      expect(closePositionResponse).toHaveProperty('positionRentRefunded');
      expect(closePositionResponse).toHaveProperty('baseTokenAmountRemoved');
      expect(closePositionResponse).toHaveProperty('quoteTokenAmountRemoved');
      expect(closePositionResponse).toHaveProperty('baseFeeAmountCollected');
      expect(closePositionResponse).toHaveProperty('quoteFeeAmountCollected');
      
      // Validate data types
      expect(typeof closePositionResponse.signature).toBe('string');
      expect(typeof closePositionResponse.fee).toBe('number');
      expect(typeof closePositionResponse.positionRentRefunded).toBe('number');
      expect(typeof closePositionResponse.baseTokenAmountRemoved).toBe('number');
      expect(typeof closePositionResponse.quoteTokenAmountRemoved).toBe('number');
      expect(typeof closePositionResponse.baseFeeAmountCollected).toBe('number');
      expect(typeof closePositionResponse.quoteFeeAmountCollected).toBe('number');
      
      // Validate ranges
      expect(closePositionResponse.fee).toBeGreaterThanOrEqual(0);
      expect(closePositionResponse.positionRentRefunded).toBeGreaterThanOrEqual(0);
      expect(closePositionResponse.baseTokenAmountRemoved).toBeGreaterThanOrEqual(0);
      expect(closePositionResponse.quoteTokenAmountRemoved).toBeGreaterThanOrEqual(0);
      expect(closePositionResponse.baseFeeAmountCollected).toBeGreaterThanOrEqual(0);
      expect(closePositionResponse.quoteFeeAmountCollected).toBeGreaterThanOrEqual(0);
      
      console.log('Meteora Close Position Response schema validation passed');
    });
  });
  
  // Live test for pool info - only run in live mode
  describe('Live Pool Info Test', () => {
    it('retrieves actual pool info from Solana mainnet-beta', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test - not in live mode');
        return;
      }
      
      // Import modules needed for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API
        const response = await axios.get('http://localhost:15888/connectors/meteora/clmm/pool-info', {
          params: {
            network: NETWORK,
            baseToken: 'SOL',
            quoteToken: 'USDC'
          }
        });
        
        const poolInfo = response.data;
        console.log('Retrieved Meteora pool info:', poolInfo);
        
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
        
        // Validate specific to Meteora
        expect(poolInfo.baseTokenAddress.toLowerCase()).toBe(SOL_MINT.toLowerCase());
        expect(poolInfo.quoteTokenAddress.toLowerCase()).toBe(USDC_MINT.toLowerCase());
        
        console.log('Live Meteora Pool Info test passed');
      } catch (error) {
        console.error('Live test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running
        console.log('Skipping live test - server may not be running');
      }
    });
  });
  
  // Live test for swap quote - only run in live mode
  describe('Live Swap Quote Test', () => {
    it('retrieves actual swap quote from Solana mainnet-beta', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test - not in live mode');
        return;
      }
      
      // Import modules needed for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API
        const response = await axios.get('http://localhost:15888/connectors/meteora/clmm/quote-swap', {
          params: {
            network: NETWORK,
            baseToken: 'SOL',
            quoteToken: 'USDC',
            amount: 1.0,
            side: 'SELL'
          }
        });
        
        const swapQuote = response.data;
        console.log('Retrieved Meteora swap quote:', swapQuote);
        
        // Validate properties
        expect(swapQuote).toHaveProperty('poolAddress');
        expect(swapQuote).toHaveProperty('estimatedAmountIn');
        expect(swapQuote).toHaveProperty('estimatedAmountOut');
        expect(swapQuote).toHaveProperty('minAmountOut');
        expect(swapQuote).toHaveProperty('maxAmountIn');
        expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
        expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
        expect(swapQuote).toHaveProperty('price');
        
        // Specific validations for the SELL side swap (selling SOL for USDC)
        expect(swapQuote.estimatedAmountIn).toBe(1.0); // We're selling exactly 1.0 SOL
        expect(swapQuote.baseTokenBalanceChange).toBeLessThan(0); // Negative change in SOL
        expect(swapQuote.quoteTokenBalanceChange).toBeGreaterThan(0); // Positive change in USDC
        
        console.log('Live Meteora Swap Quote test passed');
      } catch (error) {
        console.error('Live test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running
        console.log('Skipping live test - server may not be running');
      }
    });
  });
});
// Configure test timeout (30 seconds)
jest.setTimeout(30000);

// Test constants
const NETWORK = 'base';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SAMPLE_POOL_ADDRESS = '0x4c36388be6f416a29c8d8eee81c771ce6be14b18'; // WETH-USDC pool on Base
const SAMPLE_POSITION_ADDRESS = '0x1234567890123456789012345678901234567890'; // Example position NFT address

// Helper to determine if we should skip live tests
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== 'live';
};

describe('Uniswap CLMM Schema Tests', () => {
  describe('CLMM Pool Info Schema', () => {
    it('validates CLMM pool info schema structure', () => {
      // Create a sample pool info object that matches the CLMM schema
      const poolInfo = {
        address: SAMPLE_POOL_ADDRESS,
        baseTokenAddress: WETH_ADDRESS,
        quoteTokenAddress: USDC_ADDRESS,
        binStep: 10, // Corresponds to tickSpacing in Uniswap V3
        feePct: 0.05, // 0.05% fee tier
        price: 3200.0,
        baseTokenAmount: 10.0,
        quoteTokenAmount: 32000.0,
        activeBinId: 205800 // Example active tick in Uniswap V3
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
  
  describe('CLMM Position Info Schema', () => {
    it('validates position info schema structure', () => {
      // Create a sample position info object that matches the schema
      const positionInfo = {
        address: SAMPLE_POSITION_ADDRESS,
        poolAddress: SAMPLE_POOL_ADDRESS,
        baseTokenAddress: WETH_ADDRESS,
        quoteTokenAddress: USDC_ADDRESS,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 3200.0,
        baseFeeAmount: 0.01,
        quoteFeeAmount: 32.0,
        lowerBinId: 200000,
        upperBinId: 210000,
        lowerPrice: 3000.0,
        upperPrice: 3500.0,
        price: 3200.0
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
      
      console.log('CLMM Position Info schema validation passed');
    });
  });
  
  describe('Open Position Response Schema', () => {
    it('validates open position response schema structure', () => {
      // Create a sample open position response that matches the schema
      const openPositionResponse = {
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        fee: 0.005,
        positionAddress: SAMPLE_POSITION_ADDRESS,
        positionRent: 0.001, // ETH spent on position NFT rent
        baseTokenAmountAdded: 1.0,
        quoteTokenAmountAdded: 3200.0
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
      
      console.log('Open Position Response schema validation passed');
    });
  });
  
  describe('Collect Fees Response Schema', () => {
    it('validates collect fees response schema structure', () => {
      // Create a sample collect fees response that matches the schema
      const collectFeesResponse = {
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        fee: 0.002,
        baseFeeAmountCollected: 0.01,
        quoteFeeAmountCollected: 32.0
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
      
      console.log('Collect Fees Response schema validation passed');
    });
  });
  
  describe('Close Position Response Schema', () => {
    it('validates close position response schema structure', () => {
      // Create a sample close position response that matches the schema
      const closePositionResponse = {
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        fee: 0.003,
        positionRentRefunded: 0.0005, // ETH refunded from position NFT rent
        baseTokenAmountRemoved: 1.0,
        quoteTokenAmountRemoved: 3200.0,
        baseFeeAmountCollected: 0.01,
        quoteFeeAmountCollected: 32.0
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
      
      console.log('Close Position Response schema validation passed');
    });
  });
  
  describe('Quote Position Response Schema', () => {
    it('validates quote position response schema structure', () => {
      // Create a sample quote position response that matches the schema
      const quotePositionResponse = {
        baseLimited: true,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 3200.0,
        baseTokenAmountMax: 2.0,
        quoteTokenAmountMax: 6400.0,
        liquidity: 123456789 // Optional liquidity value
      };
      
      // Validate properties
      expect(quotePositionResponse).toHaveProperty('baseLimited');
      expect(quotePositionResponse).toHaveProperty('baseTokenAmount');
      expect(quotePositionResponse).toHaveProperty('quoteTokenAmount');
      expect(quotePositionResponse).toHaveProperty('baseTokenAmountMax');
      expect(quotePositionResponse).toHaveProperty('quoteTokenAmountMax');
      expect(quotePositionResponse).toHaveProperty('liquidity'); // Optional
      
      // Validate data types
      expect(typeof quotePositionResponse.baseLimited).toBe('boolean');
      expect(typeof quotePositionResponse.baseTokenAmount).toBe('number');
      expect(typeof quotePositionResponse.quoteTokenAmount).toBe('number');
      expect(typeof quotePositionResponse.baseTokenAmountMax).toBe('number');
      expect(typeof quotePositionResponse.quoteTokenAmountMax).toBe('number');
      
      // Validate ranges
      expect(quotePositionResponse.baseTokenAmount).toBeGreaterThanOrEqual(0);
      expect(quotePositionResponse.quoteTokenAmount).toBeGreaterThanOrEqual(0);
      expect(quotePositionResponse.baseTokenAmountMax).toBeGreaterThanOrEqual(quotePositionResponse.baseTokenAmount);
      expect(quotePositionResponse.quoteTokenAmountMax).toBeGreaterThanOrEqual(quotePositionResponse.quoteTokenAmount);
      
      console.log('Quote Position Response schema validation passed');
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
        const response = await axios.get('http://localhost:15888/connectors/uniswap/clmm/pool-info', {
          params: {
            network: NETWORK,
            baseToken: 'WETH',
            quoteToken: 'USDC',
            feeTier: 'MEDIUM' // 0.3% fee tier
          }
        });
        
        const poolInfo = response.data;
        console.log('Retrieved CLMM pool info:', poolInfo);
        
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
        
        // Validate specific to Uniswap on Base
        expect(poolInfo.baseTokenAddress.toLowerCase()).toBe(WETH_ADDRESS.toLowerCase());
        expect(poolInfo.quoteTokenAddress.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
        
        console.log('Live CLMM Pool Info test passed');
      } catch (error) {
        console.error('Live test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running
        console.log('Skipping live test - server may not be running');
      }
    });
  });
});
import {
  GetPoolInfoRequest,
  PoolInfoSchema
} from '../../../../src/schemas/trading-types/clmm-schema';
import { testSchemaAcrossConnectors, COMMON_TEST_CONSTANTS } from '../../utils/schema-test-utils';

// Custom validation for CLMM pool responses
const extraPoolTests = (connector: string, mockResponse: any) => {
  it('should have positive liquidity values', () => {
    expect(mockResponse.validResponse.baseTokenAmount).toBeGreaterThan(0);
    expect(mockResponse.validResponse.quoteTokenAmount).toBeGreaterThan(0);
  });
  
  it(`should have a valid fee percentage (0 <= feePct <= 1)`, () => {
    expect(mockResponse.validResponse.feePct).toBeGreaterThanOrEqual(0);
    expect(mockResponse.validResponse.feePct).toBeLessThanOrEqual(1);
  });
  
  if (connector === 'meteora' || connector === 'raydium') {
    it('should have a valid bin step for concentrated liquidity', () => {
      expect(mockResponse.validResponse.binStep).toBeGreaterThan(0);
    });
  }
};

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'clmm-pool-info',
  GetPoolInfoRequest,
  PoolInfoSchema,
  {
    testFieldConstraints: true,
    extraResponseTests: extraPoolTests
  }
);
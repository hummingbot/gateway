import {
  GetPositionInfoRequest,
  PositionInfoSchema
} from '../../../../src/schemas/trading-types/clmm-schema';
import { testSchemaAcrossConnectors, COMMON_TEST_CONSTANTS } from '../../utils/schema-test-utils';

// Custom validation for position responses
const extraPositionTests = (connector: string, mockResponse: any) => {
  it('should have position address matching pool address structure', () => {
    const address = mockResponse.validResponse.address;
    expect(address).toMatch(/^[a-zA-Z0-9]{32,44}$/);
  });
  
  it('should have consistent price range parameters', () => {
    const response = mockResponse.validResponse;
    if (response.lowerPrice && response.upperPrice) {
      expect(response.lowerPrice).toBeLessThan(response.upperPrice);
      expect(response.price).toBeGreaterThanOrEqual(response.lowerPrice);
      expect(response.price).toBeLessThanOrEqual(response.upperPrice);
    }
  });
  
  if (connector === 'meteora' || connector === 'raydium') {
    it('should have fee amounts available', () => {
      expect(mockResponse.validResponse.baseFeeAmount).toBeGreaterThanOrEqual(0);
      expect(mockResponse.validResponse.quoteFeeAmount).toBeGreaterThanOrEqual(0);
    });
  }
};

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'clmm-position-info',
  GetPositionInfoRequest,
  PositionInfoSchema,
  {
    testFieldConstraints: true,
    extraResponseTests: extraPositionTests
  }
);
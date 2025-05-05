import {
  GetSwapQuoteRequest,
  GetSwapQuoteResponse
} from '../../../../src/schemas/trading-types/swap-schema';
import { testSchemaAcrossConnectors, COMMON_TEST_CONSTANTS } from '../../utils/schema-test-utils';

// Custom additional tests for swap quotes
const extraSwapQuoteTests = (connector: string, mockResponse: any) => {
  it('should have price as a positive number', () => {
    expect(mockResponse.validResponse.price).toBeGreaterThan(0);
  });
  
  it('should have baseTokenBalanceChange and quoteTokenBalanceChange with opposite signs', () => {
    const baseChange = mockResponse.validResponse.baseTokenBalanceChange;
    const quoteChange = mockResponse.validResponse.quoteTokenBalanceChange;
    expect(Math.sign(baseChange) * Math.sign(quoteChange)).toBeLessThan(0);
  });
};

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'swap-quote',
  GetSwapQuoteRequest,
  GetSwapQuoteResponse,
  {
    testFieldConstraints: true,
    extraResponseTests: extraSwapQuoteTests
  }
);
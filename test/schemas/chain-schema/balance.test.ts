import {
  BalanceRequestSchema,
  BalanceResponseSchema,
} from '../../../src/schemas/chain-schema';
import { testSchemaAcrossConnectors, COMMON_TEST_CONSTANTS } from '../utils/schema-test-utils';

// Custom validation for balance responses
const extraBalanceTests = (connector: string, mockResponse: any) => {
  it('should contain at least one token balance', () => {
    const balances = mockResponse.validResponse.balances;
    expect(Object.keys(balances).length).toBeGreaterThan(0);
  });
  
  it('should have positive balance values', () => {
    const balances = mockResponse.validResponse.balances;
    Object.values(balances).forEach(balance => {
      expect(Number(balance)).toBeGreaterThanOrEqual(0);
    });
  });
  
  // Specific tests based on connector
  if (connector === 'ethereum') {
    it('should include ETH balance for Ethereum chain', () => {
      const balances = mockResponse.validResponse.balances;
      expect(balances).toHaveProperty('ETH');
    });
  } else if (connector === 'solana') {
    it('should include SOL balance for Solana chain', () => {
      const balances = mockResponse.validResponse.balances;
      expect(balances).toHaveProperty('SOL');
    });
  }
};

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'balance',
  BalanceRequestSchema,
  BalanceResponseSchema,
  {
    testFieldConstraints: true,
    extraResponseTests: extraBalanceTests
  }
);
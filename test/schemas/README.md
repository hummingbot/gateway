# Schema Testing Architecture

## Overview

This directory contains tests for schema validation across all the gateway connectors. The schema tests ensure that all connectors properly implement the interfaces defined in the gateway's schema definitions, providing consistency and reliability across different blockchains and DEXs.

## Directory Structure

- `schemas/` - Root directory for all schema tests
  - `chain-schema/` - Tests for the chain schema (balance, tokens, estimate-gas, etc.)
  - `trading-types/` - Tests for trading type schemas
    - `amm-schema/` - Tests for AMM (Automated Market Maker) schemas
    - `clmm-schema/` - Tests for CLMM (Concentrated Liquidity Market Maker) schemas
    - `swap-schema/` - Tests for Swap schemas
  - `test-params/` - Connector-specific test parameters
    - `ethereum/` - Ethereum specific test parameters
    - `solana/` - Solana specific test parameters
    - `uniswap/` - Uniswap specific test parameters
    - `jupiter/` - Jupiter specific test parameters
    - `raydium/` - Raydium specific test parameters
    - `meteora/` - Meteora specific test parameters
  - `mock-responses/` - Mock responses for testing
    - `ethereum/` - Ethereum mock responses
    - `solana/` - Solana mock responses
    - `uniswap/` - Uniswap mock responses
    - `jupiter/` - Jupiter mock responses
    - `raydium/` - Raydium mock responses
    - `meteora/` - Meteora mock responses
  - `utils/` - Testing utilities and helpers
    - `schema-test-utils.ts` - Core utilities for schema validation testing
    - `test-generator.ts` - Utilities to generate test data programmatically

## Key Features

1. **Schema Validation**: Tests validate both request and response objects against their TypeBox schemas
2. **Field Constraints**: Tests individual field constraints (type, format, range, enum values)
3. **Cross-Connector Testing**: The same test logic is applied across different connectors
4. **Connector-Specific Assertions**: Custom assertions for each connector type
5. **Automatic Test Generation**: Utilities to programmatically generate test cases
6. **Error Reporting**: Detailed error reporting when schema validation fails

## Test Parameter Structure

Each test parameter file follows this structure:

```json
[
  {
    "description": "Test case description",
    "validRequest": {
      // A valid request object matching the schema
    },
    "invalidRequest": {
      // An invalid request object failing schema validation
    },
    "fieldTests": [
      {
        "field": "fieldName",
        "validValue": "validValue",
        "invalidValue": "invalidValue",
        "description": "Testing invalid field format"
      }
    ]
  }
]
```

## Mock Response Structure

Each mock response file follows this structure:

```json
[
  {
    "validResponse": {
      // A valid response object matching the schema
    },
    "invalidResponse": {
      // An invalid response object failing schema validation
    }
  }
]
```

## Adding Tests for a New Connector

1. Add connector-specific test parameters to `test-params/[connector-name]/`
2. Add mock responses to `mock-responses/[connector-name]/`
3. The existing tests will automatically pick up the new connector parameters

You can also use the test generator to programmatically create test parameters:

```typescript
import { createStandardTestParams, createStandardMockResponse } from './utils/schema-test-utils';

const testParams = createStandardTestParams(
  { network: 'mainnet', address: 'wallet-address' },
  [
    { field: 'address', value: null },
    { field: 'network', value: 123 }
  ],
  'Basic balance request'
);
```

## Running Tests

```bash
# Run all schema tests
npm run test:schemas

# Run specific schema categories
npm run test:schemas:chain
npm run test:schemas:amm
npm run test:schemas:clmm
npm run test:schemas:swap

# Run a specific test file
npx jest test/schemas/chain-schema/balance.test.ts
```

## Extending the Test Framework

1. **Add a New Schema Test**: Create a new test file in the appropriate directory
2. **Add Custom Validations**: Use the extraRequestTests and extraResponseTests options
3. **Generate Common Test Data**: Extend the test-generator.ts file

Example of custom validation:

```typescript
testSchemaAcrossConnectors(
  'balance',
  BalanceRequestSchema,
  BalanceResponseSchema,
  {
    testFieldConstraints: true,
    extraResponseTests: (connector, mockResponse) => {
      it('should have positive balance values', () => {
        const balances = mockResponse.validResponse.balances;
        Object.values(balances).forEach(balance => {
          expect(Number(balance)).toBeGreaterThanOrEqual(0);
        });
      });
    }
  }
);
```
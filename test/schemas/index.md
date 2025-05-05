# Schema Testing Framework

## Overview

This testing framework validates that all connectors correctly implement the standard schemas defined for the Gateway API. This ensures consistent behavior across different blockchains and DEXs.

## Key Components

1. **Schema Definitions**: Located in `src/schemas/`
   - `chain-schema.ts`: Chain-specific schemas like balance, tokens, etc.
   - `trading-types/amm-schema.ts`: AMM-specific operations (Uniswap V2, etc.)
   - `trading-types/clmm-schema.ts`: CLMM-specific operations (Uniswap V3, etc.)
   - `trading-types/swap-schema.ts`: Swap-specific operations

2. **Test Directory Structure**:
   - `test/schemas/utils`: Common utilities for schema testing
   - `test/schemas/chain-schema`: Tests for chain schemas
   - `test/schemas/trading-types`: Tests for trading types schemas
   - `test/schemas/test-params`: Connector-specific test parameters
   - `test/schemas/mock-responses`: Connector-specific mock responses

## How It Works

1. **Schema Validation Tests**: We test each schema against valid and invalid data
2. **Cross-Connector Testing**: We run the same tests with parameters from different connectors
3. **Parameterized Tests**: Connector-specific test cases are stored as JSON files
4. **Automatic Discovery**: The framework automatically discovers and tests all available connectors

## Adding Tests for a New Connector

1. **Create Test Parameters**:
   ```
   test/schemas/test-params/[connector-name]/[schema-type].json
   ```
   Example: `test/schemas/test-params/uniswap/amm-pool-info.json`

2. **Create Mock Responses**:
   ```
   test/schemas/mock-responses/[connector-name]/[schema-type].json
   ```
   Example: `test/schemas/mock-responses/uniswap/amm-pool-info.json`

3. **JSON Format**:
   ```json
   [
     {
       "description": "Test case description",
       "validRequest": { /* Valid request object */ },
       "invalidRequest": { /* Invalid request object */ }
     },
     // Additional test cases...
   ]
   ```

   ```json
   [
     {
       "validResponse": { /* Valid response object */ },
       "invalidResponse": { /* Invalid response object */ }
     },
     // Additional response cases...
   ]
   ```

## Running Tests

```bash
# Run all schema tests
npm run test:schemas

# Run specific schema category tests
npm run test:schemas:chain
npm run test:schemas:amm
npm run test:schemas:clmm
npm run test:schemas:swap
```

## Adding a New Schema Type

1. Create a new schema definition in `src/schemas/`
2. Create a test file in `test/schemas/[category]/[schema-name].test.ts`
3. Create test parameters in `test/schemas/test-params/[connector]/[schema-name].json`
4. Create mock responses in `test/schemas/mock-responses/[connector]/[schema-name].json`

## Benefits of This Approach

1. **Maintainability**: Adding a new connector only requires adding test parameters, not rewriting tests
2. **Consistency**: Ensures all connectors adhere to the same schema requirements
3. **Coverage**: Comprehensive testing of all schema validations
4. **Efficiency**: Reuses test code across connectors
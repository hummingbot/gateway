# Raydium Schema Testing

## Overview

This document describes the testing approach for the Raydium connector schemas in the Gateway project. The testing strategy focuses on validating the schema structure to ensure all required fields are present and of the correct type.

## Schema Validation

The following schemas are tested:

1. **AMM Pool Info Schema** - Used for Raydium AMM (V2) pools
2. **CLMM Pool Info Schema** - Used for Raydium CLMM (Concentrated Liquidity Market Maker) pools
3. **Swap Quote Schema** - Used for swap quotes in both AMM and CLMM pools

## Test Implementation

The tests are implemented in:
- `/test/schemas/trading-types/live-tests/raydium-simple.test.js`

These tests validate:
- The presence of all required properties
- The correct data types for each property
- Valid numerical ranges for certain properties (e.g., fees, prices, amounts)
- Logical constraints (e.g., token balance changes having opposite signs in swap quotes)

## Running the Tests

The tests can be run in two modes:
1. **Mock Mode (Default)**: `npm test -- --forceExit ./test/schemas/trading-types/live-tests/raydium-simple.test.js`
2. **Live Mode**: `GATEWAY_TEST_MODE=live npm test -- --forceExit ./test/schemas/trading-types/live-tests/raydium-simple.test.js`

Or you can use the convenience script:
```
npm run test:live:raydium
```

## Mock vs. Live Testing

- **Mock Tests**: These tests validate the schema structure using pre-defined objects that follow the schema.
- **Live Tests**: These would connect to the Solana mainnet-beta network to fetch actual pool data. However, due to the need for a passphrase to initialize the wallet, these are currently skipped unless the `GATEWAY_TEST_MODE=live` environment variable is set AND a valid passphrase is provided.

## Integration with Schema-Based Testing Architecture

These tests demonstrate the efficacy of the new schema-based testing architecture by:

1. Focusing on validating the schema structure rather than the implementation details
2. Using standardized testing patterns that can be applied to any connector
3. Separating the test parameters from the test logic

## Adding New Raydium Tests

To add new tests for Raydium:

1. Add new test parameters to `/test/schemas/test-params/raydium/`
2. Add new mock responses to `/test/schemas/mock-responses/raydium/`
3. Use the existing schema tests in `/test/schemas/trading-types/` to validate them

## Next Steps

1. Complete test coverage for all remaining Raydium schemas
2. Add support for actual network testing with proper wallet setup
3. Integrate with CI/CD pipeline for automated testing
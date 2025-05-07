# Gateway Tests

This directory contains tests for the Gateway API. The test structure has been designed to be simple, maintainable, and easy to extend for community contributors.

## Test Structure

```
/test
  /schemas/                   # Schema validation tests
    /chain-schema/            # Chain schema tests
      balance.test.ts         # Balance schema tests
      estimate-gas.test.ts    # Estimate gas schema tests
      poll.test.ts            # Poll schema tests
      status.test.ts          # Status schema tests
      tokens.test.ts          # Tokens schema tests
    /trading-types/           # Trading type schema tests
      /amm-schema/            # AMM schema tests
        add-liquidity.test.ts # Add liquidity schema tests
        pool-info.test.ts     # Pool info schema tests
        remove-liquidity.test.ts # Remove liquidity schema tests
      /clmm-schema/           # CLMM schema tests
        open-position.test.ts # Open position schema tests
        pool-info.test.ts     # Pool info schema tests
        position-info.test.ts # Position info schema tests
      /swap-schema/           # Swap schema tests
        execute-swap.test.ts  # Execute swap schema tests
        quote-swap.test.ts    # Quote swap schema tests
      /helpers/               # Test helper functions
      /live-tests/            # Live network tests
    /mock-responses/          # Mock response files
      /ethereum/              # Ethereum mock responses
        balance.json          # Mock balance response
        estimate-gas.json     # Mock estimate gas response
      /solana/                # Solana mock responses
        balance.json          # Mock balance response
      /jupiter/               # Jupiter mock responses
        balance.json          # Mock balance response
        swap-execute.json     # Mock swap execute response
        swap-quote.json       # Mock swap quote response
      /uniswap/               # Uniswap mock responses
        amm-pool-info.json    # Mock AMM pool info response
        clmm-pool-info.json   # Mock CLMM pool info response
        swap-quote.json       # Mock swap quote response
    /test-params/             # Test parameters
  /services/                  # Service tests
    base.test.ts              # Base service tests
    config-manager-cert-passphrase.test.ts # Config manager cert passphrase tests
    config-manager-v2.test.ts # Config manager v2 tests
    config-validators.test.ts # Config validators tests
    /data/                    # Test data files
    logger.test.ts            # Logger tests
  /wallet/                    # Wallet tests
    wallet.controllers.test.ts # Wallet controller tests
    wallet.routes.test.ts     # Wallet route tests
  /utils/                     # Test utilities
    test-setup.ts             # Test setup utilities
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run schema tests only
GATEWAY_TEST_MODE=dev jest --runInBand test/schemas

# Run services tests only
GATEWAY_TEST_MODE=dev jest --runInBand test/services

# Run specific test
GATEWAY_TEST_MODE=dev jest --runInBand test/schemas/chain-schema/balance.test.ts
```

## Adding a New Chain or Connector

### Adding a New Chain

1. Create chain implementation files:
   ```bash
   mkdir -p src/chains/yourchain/routes
   touch src/chains/yourchain/yourchain.ts
   touch src/chains/yourchain/yourchain.config.ts
   touch src/chains/yourchain/yourchain.routes.ts
   touch src/chains/yourchain/yourchain.utils.ts
   ```

2. Create test mock files:
   ```bash
   mkdir -p test/schemas/mock-responses/yourchain
   touch test/schemas/mock-responses/yourchain/balance.json
   touch test/schemas/mock-responses/yourchain/status.json
   touch test/schemas/mock-responses/yourchain/estimate-gas.json
   ```

3. Create test parameter files:
   ```bash
   mkdir -p test/schemas/test-params/yourchain
   touch test/schemas/test-params/yourchain/balance.json
   touch test/schemas/test-params/yourchain/status.json
   touch test/schemas/test-params/yourchain/estimate-gas.json
   ```

4. Create schema test files (if needed) or reuse existing schema tests

### Adding a New Connector

1. Create connector implementation files:
   ```bash
   mkdir -p src/connectors/yourconnector/routes
   touch src/connectors/yourconnector/yourconnector.ts
   touch src/connectors/yourconnector/yourconnector.config.ts
   touch src/connectors/yourconnector/yourconnector.routes.ts
   ```

2. If the connector supports AMM, create these files:
   ```bash
   mkdir -p src/connectors/yourconnector/amm-routes
   touch src/connectors/yourconnector/amm-routes/executeSwap.ts
   touch src/connectors/yourconnector/amm-routes/poolInfo.ts
   touch src/connectors/yourconnector/amm-routes/quoteSwap.ts
   # Add other AMM operation files as needed
   ```

3. If the connector supports CLMM, create these files:
   ```bash
   mkdir -p src/connectors/yourconnector/clmm-routes
   touch src/connectors/yourconnector/clmm-routes/executeSwap.ts
   touch src/connectors/yourconnector/clmm-routes/poolInfo.ts
   touch src/connectors/yourconnector/clmm-routes/quoteSwap.ts
   touch src/connectors/yourconnector/clmm-routes/openPosition.ts
   # Add other CLMM operation files as needed
   ```

4. Create test mock files:
   ```bash
   mkdir -p test/schemas/mock-responses/yourconnector
   touch test/schemas/mock-responses/yourconnector/swap-quote.json
   touch test/schemas/mock-responses/yourconnector/swap-execute.json
   # Add other mock response files as needed
   ```

5. Create test parameter files:
   ```bash
   mkdir -p test/schemas/test-params/yourconnector
   touch test/schemas/test-params/yourconnector/swap-quote.json
   touch test/schemas/test-params/yourconnector/swap-execute.json
   # Add other test parameter files as needed
   ```

## Mock Responses

All tests use mock responses stored in JSON files in the `test/schemas/mock-responses` directory. These files can be easily updated to match current API responses for verification or to add new test cases.

To update mock responses with live data:

1. Run the Gateway API locally
2. Make the API calls you want to test
3. Save the responses as JSON files in the appropriate mock directory
4. Run the tests to verify they work with the updated mock data

This approach ensures the tests run without requiring actual network connections, making them suitable for CI/CD environments.

## Test Parameters

Test parameters are stored in JSON files in the `test/schemas/test-params` directory. These files contain the parameters needed to make the API calls for testing.

## Test Design Principles

1. **Schema Validation**: Tests focus on validating request and response schemas
2. **Maintainability**: Tests are organized by schema type for easy maintenance
3. **Mock-based**: All tests use mock responses to avoid network dependencies
4. **Reusability**: Schema tests are reused across different chains and connectors
5. **Standardization**: Standard schemas ensure consistent API behavior
# Gateway Tests

This directory contains tests for the Gateway API. The test structure has been designed to be simple, maintainable, and easy to extend for community contributors.

## Test Structure

```
/test
  /schemas/                   # Schema and API validation tests
    /chain-schema/            # Chain schema tests
    /trading-types/           # Trading type schema tests
    /helpers/                 # Test helper functions
    /live-tests/              # Live network tests
    /mock-responses/          # Mock response files
    /test-params/             # Test parameters
  /services/                  # Service tests
    /data/                    # Test data files
  /wallet/                    # Wallet tests
  /utils/                     # Test utilities
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
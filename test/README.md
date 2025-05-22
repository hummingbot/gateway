# Gateway Tests

This directory contains tests for the Gateway API. The test structure has been designed to be simple, maintainable, and easy to extend for community contributors.

## Test Structure

```
/test
  /chains/                    # Chain endpoint tests (ethereum.test.js, solana.test.js)
  /connectors/                # Connector endpoint tests by protocol
    /jupiter/                 # Jupiter connector tests
    /uniswap/                 # Uniswap connector tests
    /raydium/                 # Raydium connector tests
    /meteora/                 # Meteora connector tests
  /mocks/                     # Mock response data
    /chains/                  # Chain mock responses
    /connectors/              # Connector mock responses
  /services/                  # Service tests
    /data/                    # Test data files
  /wallet/                    # Wallet tests
  /utils/                     # Test utilities
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run chain tests only
GATEWAY_TEST_MODE=dev jest --runInBand test/chains

# Run connector tests only
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors

# Run services tests only
GATEWAY_TEST_MODE=dev jest --runInBand test/services

# Run specific test
GATEWAY_TEST_MODE=dev jest --runInBand test/chains/ethereum.test.js
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/jupiter/swap.test.js
```

## Test Setup and Configuration

### Jest Configuration

Tests are configured in `jest.config.js` at the project root, which specifies:

- Test environment: Node.js
- Setup files: `test/jest-setup.js`
- Coverage path ignore patterns
- Module path ignore patterns

### Test Environment Setup

The test environment is configured in `test/jest-setup.js`, which:

1. **Sets the global Jest timeout to 10 seconds** - Prevents tests from timing out too quickly
2. **Mocks problematic native modules**:
   - Mocks the `brotli` module to prevent ASM.js linking failures
   - This ensures tests can run in environments without native module support
3. **Prevents process exits during tests**:
   - Mocks the oclif error handler to prevent premature test termination
   - Ensures test execution completes even when error conditions would normally exit the process

### Test Environment Variables

Tests use the following environment variables:

- `GATEWAY_TEST_MODE=dev` - Runs tests in development mode without requiring real blockchain connections
- Running tests without this variable will attempt to connect to real networks and may fail

## Mock Responses

All tests use mock responses stored in JSON files in the `test/mocks` directory, organized by chain and connector. These files can be easily updated to match current API responses for verification or to add new test cases.

Directory structure for mocks:
```
/mocks
  /chains/
    /ethereum/      # Generic Ethereum mock responses
    /solana/        # Generic Solana mock responses
  /connectors/
    /jupiter/       # Jupiter connector mock responses
    /raydium/       # Raydium connector mock responses
    /meteora/       # Meteora connector mock responses
    /uniswap/       # Uniswap connector mock responses
```

To update mock responses with live data:

1. Run the Gateway API locally
2. Make the API calls you want to test
3. Save the responses as JSON files in the appropriate mock directory
4. Run the tests to verify they work with the updated mock data

This approach ensures the tests run without requiring actual network connections, making them suitable for CI/CD environments.

## Supported Schema Types

Gateway supports the following schema types for DEX connectors:

1. **Swap Schema**: Basic token swap operations common to all DEXs
   - Quote Swap: Get price quotes for token swaps
   - Execute Swap: Execute token swaps between pairs

2. **AMM Schema**: Automated Market Maker operations
   - Pool Info: Get information about liquidity pools
   - Add Liquidity: Add liquidity to pools
   - Remove Liquidity: Remove liquidity from pools
   - Position Info: Get information about liquidity positions

3. **CLMM Schema**: Concentrated Liquidity Market Maker operations
   - Pool Info: Get information about concentrated liquidity pools
   - Open Position: Open a new concentrated liquidity position
   - Close Position: Close a concentrated liquidity position
   - Add Liquidity: Add liquidity to a position
   - Remove Liquidity: Remove liquidity from a position
   - Collect Fees: Collect fees from a position
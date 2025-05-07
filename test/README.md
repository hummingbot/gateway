# Gateway Tests

This directory contains tests for the Gateway API. The test structure has been designed to be simple, maintainable, and easy to extend for community contributors.

## Test Structure

```
/test
  /chains/                    # Chain tests
    ethereum.test.js          # Ethereum chain tests (Base network)
    solana.test.js            # Solana chain tests (mainnet-beta)
    # Add your chain test here
  
  /connectors/                # Connector tests
    /uniswap/                 # Uniswap connector tests
      amm.test.js             # Tests for Uniswap AMM
      clmm.test.js            # Tests for Uniswap CLMM
    /jupiter/                 # Jupiter connector tests
      swap.test.js            # Tests for Jupiter swap
    # Add your connector tests here
  
  /mocks/                     # Mock response files
    /chains/                  # Chain mocks
      /ethereum-base/         # Ethereum Base mocks
        balance.json          # Mock balance response
        tokens.json           # Mock tokens response
        status.json           # Mock status response
      /solana-mainnet/        # Solana mainnet mocks
        # Similar mock files
    /connectors/              # Connector mocks
      /uniswap-base/          # Uniswap on Base mocks
        amm-pool-info.json    # Mock AMM pool info response
        amm-quote-swap.json   # Mock AMM quote swap response
        # Other responses
      /jupiter-mainnet/       # Jupiter on Solana mocks
        quote-swap.json       # Mock quote swap response
        execute-swap.json     # Mock execute swap response
  
  /templates/                 # Templates for new tests
    chain.test.template.js    # Template for new chain tests
    connector.test.template.js # Template for new connector tests
    /mock-examples/           # Example mock responses
      chain-balance.json      # Example chain balance response
      connector-pool-info.json # Example connector pool info response
      connector-quote-swap.json # Example connector quote swap response
```

## Running Tests

```bash
# Run all tests
npm test

# Run chain tests only
npm test test/chains

# Run connector tests only
npm test test/connectors

# Run specific test
npm test test/chains/ethereum.test.js
```

## Adding a New Chain or Connector

### Adding a New Chain

1. Copy the template file:
   ```bash
   cp test/templates/chain.test.template.js test/chains/yourchain.test.js
   ```

2. Create the mock directory and files:
   ```bash
   mkdir -p test/mocks/chains/yourchain-yournetwork
   cp test/templates/mock-examples/chain-balance.json test/mocks/chains/yourchain-yournetwork/balance.json
   # Create similar files for tokens.json, status.json, etc.
   ```

3. Edit the template file to update chain-specific values:
   - Update constants (CHAIN, NETWORK, TEST_WALLET)
   - Update validation functions if your chain has different response formats
   - Add or remove test cases as needed

### Adding a New Connector

1. Create the connector directory and copy the template file:
   ```bash
   mkdir -p test/connectors/yourconnector
   cp test/templates/connector.test.template.js test/connectors/yourconnector/protocol.test.js
   # For example: test/connectors/pancakeswap/swap.test.js
   ```

2. Create the mock directory and files:
   ```bash
   mkdir -p test/mocks/connectors/yourconnector-network
   cp test/templates/mock-examples/connector-pool-info.json test/mocks/connectors/yourconnector-network/protocol-pool-info.json
   cp test/templates/mock-examples/connector-quote-swap.json test/mocks/connectors/yourconnector-network/protocol-quote-swap.json
   # Create similar files for other responses
   ```

3. Edit the template file to update connector-specific values:
   - Update constants (CONNECTOR, PROTOCOL, CHAIN, NETWORK, etc.)
   - Uncomment and update relevant test sections for your connector
   - Update validation functions for your connector-specific response formats
   - Add or remove test cases as needed

## Mock Responses

All tests use mock responses stored in JSON files. These files can be easily updated to match current API responses for verification or to add new test cases.

To update mock responses with live data:

1. Run the Gateway API locally
2. Make the API calls you want to test
3. Save the responses as JSON files in the appropriate mock directory
4. Run the tests to verify they work with the updated mock data

This approach ensures the tests run without requiring actual network connections, making them suitable for CI/CD environments.

## Test Design Principles

1. **Simplicity**: Each test file focuses on a single chain or connector/protocol combination
2. **Maintainability**: Tests are organized in a flat structure that's easy to navigate
3. **Mock-based**: All tests use mock responses to avoid network dependencies
4. **Extensibility**: New chains and connectors can be added by following the templates
5. **Single Network**: Each chain/connector test focuses on a single network for simplicity
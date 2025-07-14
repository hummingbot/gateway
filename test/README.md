# Gateway Tests

This directory contains comprehensive test suites for the Gateway API. The test structure is designed to be modular, maintainable, and easy to extend.

## Test Structure

```
/test
  /chains/                    # Chain endpoint tests
    chain.test.js            # Chain routes test
    ethereum.test.js         # Ethereum chain tests
    solana.test.js           # Solana chain tests
  /connectors/                # Connector endpoint tests by protocol
    /jupiter/                 # Jupiter connector tests
      swap.test.js           # Swap operation tests
    /uniswap/                 # Uniswap connector tests
      amm.test.js            # V2 AMM tests
      clmm.test.js           # V3 CLMM tests
      swap.test.js           # Universal Router tests
    /raydium/                 # Raydium connector tests
      amm.test.js            # AMM operation tests
      clmm.test.js           # CLMM operation tests
    /meteora/                 # Meteora connector tests
      clmm.test.js           # CLMM operation tests
  /mocks/                     # Mock response data
    /chains/                  # Chain mock responses
      chains.json            # Chain list response
      /ethereum/             # Ethereum mock responses
        balance.json
        status.json
        tokens.json
      /solana/               # Solana mock responses
        balance.json
        status.json
        tokens.json
    /connectors/              # Connector mock responses
      connectors.json        # Connector list response
      /jupiter/
      /raydium/
      /meteora/
      /uniswap/
  /services/                  # Service tests
    /data/                    # Test data files
  /wallet/                    # Wallet tests
  /config/                    # Configuration tests
  jest-setup.js              # Test environment configuration
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage report
pnpm test:cov

# Run tests in watch mode (for development)
pnpm test:debug

# Run chain tests only
GATEWAY_TEST_MODE=dev jest --runInBand test/chains

# Run specific connector tests
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/uniswap
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/raydium/amm.test.js

# Run a single test file
GATEWAY_TEST_MODE=dev jest --runInBand test/chains/ethereum.test.js

# Clear Jest cache if tests are behaving unexpectedly
pnpm test:clear-cache
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

| Variable | Description | Required |
|----------|-------------|----------|
| `GATEWAY_TEST_MODE=dev` | Runs tests with mocked blockchain connections | Yes |
| `START_SERVER=true` | Required when starting the actual server | No (tests only) |

**Note**: Always use `GATEWAY_TEST_MODE=dev` for unit tests to avoid real blockchain connections

## Mock Responses

Tests use mock responses stored in JSON files in the `test/mocks` directory. This approach ensures:
- Tests run without blockchain connections
- Consistent test results
- Fast test execution
- CI/CD compatibility

### Mock File Naming Convention

| Operation | Mock File Name |
|-----------|----------------||
| Chain status | `status.json` |
| Token balances | `balance.json` |
| Token info | `tokens.json` |
| Pool info | `{type}-pool-info.json` |
| Swap quote | `{type}-quote-swap.json` |
| Position info | `{type}-position-info.json` |

Where `{type}` is either `amm` or `clmm`.

### Updating Mock Responses

1. **Start Gateway locally**:
   ```bash
   pnpm start --passphrase=test --dev
   ```

2. **Make API calls** to get real responses:
   ```bash
   curl http://localhost:15888/chains/ethereum/status
   ```

3. **Save responses** in the appropriate mock file:
   ```bash
   # Example: Save Ethereum status response
   curl http://localhost:15888/chains/ethereum/status > test/mocks/chains/ethereum/status.json
   ```

4. **Verify tests** pass with updated mocks:
   ```bash
   GATEWAY_TEST_MODE=dev jest --runInBand test/chains/ethereum.test.js
   ```

## Writing Tests

### Test Structure Example

```javascript
// test/connectors/uniswap/amm.test.js
describe('Uniswap AMM Routes', () => {
  const mockApp = {
    inject: (options) => {
      // Mock implementation
    }
  };

  beforeEach(() => {
    // Setup mocks
  });

  it('should return pool information', async () => {
    const response = await mockApp.inject({
      method: 'GET',
      url: '/connectors/uniswap/amm/pool-info',
      query: {
        chain: 'ethereum',
        network: 'mainnet',
        tokenA: 'USDC',
        tokenB: 'WETH'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      poolAddress: expect.any(String),
      token0: expect.any(String),
      token1: expect.any(String)
    });
  });
});
```

### Testing Best Practices

1. **Use descriptive test names** that explain what is being tested
2. **Test both success and error cases**
3. **Verify response structure** matches TypeBox schemas
4. **Mock external dependencies** (blockchain calls, API requests)
5. **Keep tests isolated** - each test should be independent
6. **Use beforeEach/afterEach** for setup and cleanup

### Coverage Requirements

- New features must have **minimum 75% code coverage**
- Run `pnpm test:cov` to check coverage
- Coverage reports are generated in `/coverage` directory

## Troubleshooting Tests

### Common Issues

1. **Tests timing out**
   - Increase timeout in specific test: `jest.setTimeout(30000)`
   - Check for unresolved promises

2. **Mock data mismatch**
   - Update mock files with current API responses
   - Verify mock file paths are correct

3. **Module not found errors**
   - Clear Jest cache: `pnpm test:clear-cache`
   - Check import paths use correct aliases

4. **Native module errors**
   - These are handled by `jest-setup.js`
   - If new errors appear, add mocks to setup file
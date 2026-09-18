# Gateway Tests

This directory contains comprehensive test suites for the Gateway API. The test structure is designed to be modular, maintainable, and easy to extend.

## Test Structure

```
/test
  app.integration.test.ts     # Whole-app wiring
  /chains/                    # Chain route tests
    chain.routes.test.ts      # The parameterized /chains/{chain} table
    /ethereum/                # Ethereum chain + its routes
    /solana/                  # Solana chain + its routes
  /connectors/                # Connector tests, one directory per connector
    /0x/ /dflow/ /jupiter/ /okx/ /titan/          # router-only connectors
    /meteora/ /orca/ /raydium/ /pancakeswap-sol/  # Solana AMM/CLMM
    /pancakeswap/ /uniswap/                       # EVM AMM/CLMM
      /router-routes/ /amm-routes/ /clmm-routes/  # by trading type
  /trading/                   # The unified /trading/* routes themselves
    /clmm/ /pool-swap/ /trading-amm-routes/ /trading-clmm-routes/
  /mocks/                     # Shared mock modules (TypeScript, not fixtures)
    app-mocks.ts              # Import before importing app
    shared-mocks.ts
    /0x/ /orca/               # Per-connector mock data modules
  /helpers/                   # commonMocks, connectorMocks, connector-test-utils
  /utils/testUtils.ts         # fastifyWithTypeProvider — use this to build a server
  /config/ /pools/ /rpc/ /services/ /tokens/ /wallet/
  jest-setup.js               # Test environment configuration
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
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/raydium

# Run a single test file
GATEWAY_TEST_MODE=dev jest --runInBand test/chains/ethereum/routes/status.test.ts

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

## Mocking

Tests mock the modules a route depends on — the chain class, the connector class, the
services — and then drive the route through `app.inject`. Real Gateway code runs; only
the blockchain is absent.

Shared mock modules live in `test/mocks` and `test/helpers`. A suite that builds the
whole app imports `test/mocks/app-mocks` **before** importing the app:

```typescript
import './mocks/app-mocks';
```

### Do not mock the transport

An earlier generation of these tests mocked `axios`, called it, and asserted that the
canned response they had just supplied had the shape they had supplied. Those imported
nothing from `src/` and would have passed against an empty `src/` — they were deleted.
If a test does not run Gateway code, it is not testing Gateway.

Fixture JSON captured from a live server is gone for the same reason: it goes stale
silently, and a test that asserts against it is asserting about the day it was
captured. Build the response the mocked module returns in the test file, where the
reader can see it.

## Writing Tests

### Test Structure Example

```typescript
// test/connectors/orca/clmm-routes/collectFees.test.ts
import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { collectFeesRoute } = await import('../../../../src/trading/trading-clmm-routes/collect-fees');
  await server.register(collectFeesRoute);
  return server;
};

describe('POST /collect-fees (orca)', () => {
  it('collects fees and reports the amounts and the pool', async () => {
    // Mock what the connector actually calls — not a method it never reaches.
    (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig123' }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [0.1, 20] }),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/collect-fees',
      payload: { chainNetwork: 'solana-mainnet-beta', connector: 'orca', positionAddress: POSITION },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 1, data: { baseFeeAmountCollected: 0.1 } });
  });
});
```

Use `fastifyWithTypeProvider()` from `test/utils/testUtils` rather than bare
`Fastify()`: it registers the custom schema keywords (`x-connectors`) and the `decimal`
format, which AJV's strict mode rejects otherwise.

### Testing Best Practices

1. **Assert one outcome, not a set.** `expect([200, 400, 500]).toContain(status)` asserts
   nothing — it passes whether the route works, rejects, or crashes. If you cannot say
   which status a case produces, the test does not yet know what it is testing.
2. **Mock what the code actually calls.** Mocking a method the connector never reaches
   leaves the real SDK on the path, the route 500s, and a hedged assertion hides it.
   Check the call site before writing the mock.
3. **Use descriptive test names** that explain what is being tested
4. **Test both success and error cases**
5. **Verify response structure** matches TypeBox schemas
6. **Keep tests isolated** - each test should be independent
7. **Use beforeEach/afterEach** for setup and cleanup

### Coverage Requirements

- New features must have **minimum 75% code coverage**
- Run `pnpm test:cov` to check coverage
- Coverage reports are generated in `/coverage` directory

## Troubleshooting Tests

### Common Issues

1. **Tests timing out**
   - Increase timeout in specific test: `jest.setTimeout(30000)`
   - Check for unresolved promises

2. **AJV strict-mode errors about an unknown keyword or format**
   - Build the server with `fastifyWithTypeProvider()`, not bare `Fastify()`

3. **Module not found errors**
   - Clear Jest cache: `pnpm test:clear-cache`
   - Check import paths use correct aliases

4. **Native module errors**
   - These are handled by `jest-setup.js`
   - If new errors appear, add mocks to setup file
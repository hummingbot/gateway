# Uniswap Testing Guide

This document provides instructions for running the Uniswap connector tests in both mock and live modes.

## Test Files

The Uniswap connector tests are split into three main files:

1. `uniswap-amm.test.js` - Tests for Uniswap AMM functionality (Uniswap V2)
2. `uniswap-clmm.test.js` - Tests for Uniswap CLMM functionality (Uniswap V3)
3. `uniswap-swap.test.js` - Tests for Uniswap swap operations (common to both V2 and V3)

## Mock Testing

By default, all tests run in mock mode, which validates the schema structures without making actual API calls to the gateway. These tests ensure that the data structures conform to the expected schemas.

To run mock tests:

```bash
npm test -- test/schemas/trading-types/live-tests/uniswap-amm.test.js
npm test -- test/schemas/trading-types/live-tests/uniswap-clmm.test.js
npm test -- test/schemas/trading-types/live-tests/uniswap-swap.test.js
```

Or run all tests at once:

```bash
npm test -- test/schemas/trading-types/live-tests/uniswap-*.test.js
```

## Live Testing

To run tests against a live gateway instance that connects to the Base network, you need to:

1. Start the gateway with Uniswap connector configured for Base network
2. Set the `GATEWAY_TEST_MODE` environment variable to `live`

### Starting the Gateway

To start the gateway with the appropriate configuration:

```bash
npm run start -- --network base
```

Ensure that your `base.json` token list includes at least WETH and USDC tokens, and that your `uniswap.yml` configuration has the correct contract addresses for the Base network.

### Running Live Tests

Once the gateway is running, you can execute the live tests:

```bash
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/uniswap-amm.test.js
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/uniswap-clmm.test.js
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/uniswap-swap.test.js
```

Or run all live tests at once:

```bash
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/uniswap-*.test.js
```

## Test Configuration

The tests use the following configurations for the Base network:

- Network: `base`
- WETH address: `0x4200000000000000000000000000000000000006`
- USDC address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Sample pool address: `0x4c36388be6f416a29c8d8eee81c771ce6be14b18` (WETH-USDC pool)

## Notes for Live Testing

1. Live tests make actual API calls to the gateway, which in turn communicates with the Base network
2. Ensure you have properly configured wallets with funds on the Base network
3. The tests use small amounts (0.1 WETH) to minimize costs
4. Only GET endpoints are tested in live mode (pool info, position info, swap quotes)
5. No actual transactions are submitted in these tests

## Extending the Tests

To add more tests:

1. Add new test cases to the existing files
2. For mock tests, create additional schema validation cases
3. For live tests, add new API endpoint tests using the pattern in the existing files

## Troubleshooting

If live tests fail:

1. Check if the gateway is running
2. Ensure Base network is configured correctly
3. Verify wallet addresses have funds
4. Check contract addresses in the configuration
5. Examine gateway logs for RPC errors
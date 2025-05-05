# Solana Connectors Testing Guide

This document provides instructions for running the Solana-based connector tests (Jupiter, Meteora, and Raydium) in both mock and live modes.

## Test Files

The Solana connector tests are split into the following files:

1. `jupiter-swap.test.js` - Tests for Jupiter swap aggregator functionality
2. `meteora-clmm.test.js` - Tests for Meteora CLMM functionality
3. `raydium-simple.test.js` - Tests for Raydium AMM and CLMM functionality

## Mock Testing

By default, all tests run in mock mode, which validates the schema structures without making actual API calls to the gateway. These tests ensure that the data structures conform to the expected schemas.

To run mock tests:

```bash
npm test -- test/schemas/trading-types/live-tests/jupiter-swap.test.js
npm test -- test/schemas/trading-types/live-tests/meteora-clmm.test.js
npm test -- test/schemas/trading-types/live-tests/raydium-simple.test.js
```

Or run all Solana tests at once:

```bash
npm test -- test/schemas/trading-types/live-tests/{jupiter,meteora,raydium}*.test.js
```

## Live Testing

To run tests against a live gateway instance that connects to the Solana network, you need to:

1. Start the gateway with the appropriate connector configured for Solana mainnet-beta
2. Set the `GATEWAY_TEST_MODE` environment variable to `live`

### Starting the Gateway

To start the gateway with the appropriate configuration:

```bash
npm run start -- --network solana-mainnet
```

Ensure that your `solana.json` token list includes at least SOL, USDC, and USDT tokens, and that your connector-specific configuration (`jupiter.yml`, `meteora.yml`, etc.) has the correct settings for the Solana mainnet.

### Running Live Tests

Once the gateway is running, you can execute the live tests:

```bash
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/jupiter-swap.test.js
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/meteora-clmm.test.js
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/raydium-simple.test.js
```

Or run all live tests at once:

```bash
GATEWAY_TEST_MODE=live npm test -- test/schemas/trading-types/live-tests/{jupiter,meteora,raydium}*.test.js
```

## Test Configuration

The tests use the following configurations for the Solana mainnet:

- Network: `mainnet-beta`
- SOL address: `So11111111111111111111111111111111111111112`
- USDC address: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- USDT address: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
- Sample pool addresses: Various addresses for different connectors and pool types

## Connector-Specific Notes

### Jupiter

- Jupiter is a swap aggregator that finds the best routes across multiple DEXes on Solana
- Test cases focus on swap quotes and execution
- Multi-hop swap tests are included to verify the routing functionality
- Various token pairs are tested including SOL/USDC and higher-slippage tokens like BONK/USDC

### Meteora

- Meteora tests focus on the CLMM (Concentrated Liquidity Market Maker) functionality
- Tests include pool info, position management, and swap operations
- Bins (similar to Uniswap V3 ticks) are tested for proper structure

### Raydium

- Raydium tests cover both AMM (Automated Market Maker) and CLMM functionality
- Tests verify the structure of pool information, position data, and swap operations

## Notes for Live Testing

1. Live tests make actual API calls to the gateway, which in turn communicates with the Solana mainnet
2. Ensure you have properly configured wallets with funds on the Solana network for write operations
3. The tests use small amounts (1.0 SOL or equivalent) to minimize costs
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
2. Ensure Solana network is configured correctly
3. Verify wallet addresses have funds
4. Check RPC endpoint settings in the configuration
5. Examine gateway logs for RPC errors
6. Make sure the tokens being used in tests are available on the configured network
# Uniswap Router Test Coverage

This directory contains comprehensive tests for the Uniswap V3 Smart Order Router integration.

## Test Coverage

### Quote Swap Tests (`swap.test.js`)
- **SELL Orders**: Tests selling base tokens for quote tokens
- **BUY Orders**: Tests buying base tokens with quote tokens
- **Gas Parameters**: Validates gas limit (300,000) and gas price calculations
- **Multi-Network Support**: Tests all supported Ethereum networks (mainnet, arbitrum, optimism, base, polygon, etc.)

### Execute Swap Tests (`swap.test.js`)
- **SELL Execution**: Tests execution of sell orders
- **BUY Execution**: Tests execution of buy orders
- **Slippage Validation**: Ensures slippage parameters are handled correctly
- **Multi-Network Execution**: Tests swap execution across different networks

### Key Validations
1. **Gas Limit**: Fixed at 300,000 for all swaps
2. **Gas Price**: Uses dynamic gas price from ethereum.estimateGasPrice()
3. **Gas Cost**: Calculated as gasPrice * gasLimit * 1e-9
4. **Balance Changes**: Validates correct positive/negative balance changes for BUY/SELL
5. **Price Calculations**: Validates price calculations for both trade directions

### Mock Data
- Mock responses are stored in `mocks/` directory
- Gas parameters reflect the implementation's fixed 300,000 gas limit
- Realistic gas prices (e.g., 0.8 GWEI for mainnet)

## Running Tests

```bash
# Run all Uniswap tests
npm test -- test/connectors/uniswap/

# Run specific test file
npm test -- test/connectors/uniswap/swap.test.js

# Run with coverage
npm test -- --coverage test/connectors/uniswap/
```
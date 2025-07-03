# 0x Connector Implementation Plan

## Overview
Add a 0x DEX aggregator connector for Ethereum networks, similar to the Jupiter connector for Solana. This will validate that our standardized swap schema works across both Ethereum and Solana-based DEX aggregators.

## Architecture Design

### 1. Core Components
- **0x Connector Class** (`src/connectors/0x/0x.ts`)
  - Singleton pattern with network-specific instances
  - Methods: `getQuote()`, `executeTrade()`
  - Integration with 0x API (https://api.0x.org)
  - API key management from configuration

### 2. Route Handlers
- **Quote Swap** (`src/connectors/0x/swap-routes/quoteSwap.ts`)
  - Endpoint: `GET /connectors/0x/swap/quote-swap`
  - Uses 0x `/swap/v1/price` endpoint for indicative pricing
  - Supports BUY and SELL operations
  - Returns standardized quote response

- **Execute Swap** (`src/connectors/0x/swap-routes/executeSwap.ts`)
  - Endpoint: `POST /connectors/0x/swap/execute-swap`
  - Uses 0x `/swap/v1/quote` endpoint for firm quotes
  - Executes transaction on Ethereum chain
  - Returns transaction hash and status

### 3. Configuration
- **TypeScript Config** (`src/connectors/0x/0x.config.ts`)
  - API URL configuration
  - Default slippage settings
  - Gas price multiplier options

- **YAML Template** (`src/templates/connectors/0x.yml`)
  - Network-specific configurations
  - API key placeholder
  - Supported networks list

### 4. Key Implementation Details

#### Transaction Signing Approach:
- Gateway already has ethers.js v5 integrated in Ethereum chain
- Wallets are loaded as ethers.js `Wallet` instances with signing capabilities
- Execute-swap will use `wallet.sendTransaction()` with extracted fields
- No need for separate signing - ethers.js handles it automatically

#### Quote-Swap Flow:
1. Parse request (token addresses, amounts, side)
2. Call 0x `/swap/v1/price` with appropriate parameters
3. Calculate expected balance changes based on side (BUY/SELL)
4. Return standardized response with price and amounts

#### Execute-Swap Flow:
1. Parse request with quote parameters
2. Call 0x `/swap/v1/quote` for firm quote
3. For ERC20 tokens (not ETH):
   - Get 0x Exchange Proxy address from quote response
   - Check current allowance using `ethereum.getERC20Allowance()`
   - If insufficient, throw error with message directing to approve endpoint
   - Include required approval amount and spender address in error
4. Extract required fields for ethers.js transaction:
   - `to`, `data`, `value`, `gas`, `gasPrice`, `chainId`
5. Get wallet instance from Ethereum chain
6. Send transaction using `wallet.sendTransaction()` with only required fields
7. Wait for transaction confirmation
8. Calculate balance changes based on side (BUY/SELL)
9. Return transaction hash and status with balance data

### 5. Error Handling
- Invalid token addresses → 404 Not Found
- No route available → 404 Not Found
- Insufficient liquidity → 400 Bad Request
- Insufficient token allowance → 400 Bad Request with approval instructions
- Insufficient token balance → 400 Bad Request with balance details
- API key missing/invalid → 401 Unauthorized
- Network errors → 503 Service Unavailable
- Gas estimation failure → 400 Bad Request

### 6. Testing Strategy
- Mock 0x API responses for different scenarios
- Test BUY and SELL operations
- Test error cases (invalid tokens, amounts)
- Validate schema compliance
- Integration with Ethereum chain mock

## Implementation Steps

### Phase 1: Configuration Setup
1. Create 0x.config.ts with TypeBox schema
2. Create 0x.yml template
3. Add JSON schema for validation

### Phase 2: Core Implementation
1. Implement 0x connector class
2. Add quote method using /price endpoint
3. Add execute method using /quote endpoint
4. Handle API authentication

### Phase 3: Route Handlers
1. Create quoteSwap.ts route handler
2. Create executeSwap.ts route handler
3. Register routes in 0x.routes.ts

### Phase 4: Testing
1. Create mock data files
2. Write unit tests for connector class
3. Write route handler tests
4. Test error scenarios

### Phase 5: Integration
1. Update connector registry
2. Run full test suite
3. Verify with linting and type checking

## Key Differences from Jupiter
1. **API Endpoints**: Use /price for quotes, /quote for execution
2. **Token Approvals**: Must approve 0x Exchange Proxy before ERC20 swaps
3. **Transaction Signing**: Uses ethers.js wallet with explicit field extraction
4. **Gas Management**: Gas price and limit provided by 0x API
5. **Network Support**: Ethereum mainnet and testnets
6. **Authentication**: Requires API key in headers
7. **Transaction Format**: Must extract specific fields (to, data, value, gas, gasPrice, chainId) for ethers.js

## Success Criteria
- [ ] Quote-swap returns accurate pricing from 0x
- [ ] Execute-swap successfully submits transactions
- [ ] Token allowance checking prevents failed transactions
- [ ] Error messages guide users to approval endpoint when needed
- [ ] Balance validation prevents insufficient funds errors
- [ ] Error handling covers all edge cases
- [ ] Tests achieve >80% coverage
- [ ] Schema validation works correctly
- [ ] Integration with existing Ethereum chain instance
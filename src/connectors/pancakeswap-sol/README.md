# PancakeSwap Solana CLMM Connector

This connector provides integration with PancakeSwap's Concentrated Liquidity Market Maker (CLMM) pools on Solana.

## Overview

PancakeSwap Solana is a fork of Raydium CLMM using the same IDL but with a different program ID:
- **Program ID**: `HpNfyc2Saw7RKkQd8nEL4khUcuPhQ7WwY1B2qjx8jxFq`
- **IDL**: Same as Raydium CLMM (amm_v3)

## Implementation Approach

This connector uses two approaches:
1. **Manual buffer decoding** for read-only operations (pool info, position info)
2. **Anchor instruction encoding** for transactions (swap execution)

Key features:
- ✅ Works with PancakeSwap's different program ID
- ✅ Read-only pool and position information
- ✅ Swap execution with manual transaction building
- ✅ No dependency on Raydium SDK

## Implemented Routes

### Read-Only Routes (Implemented)

#### 1. Pool Info
- **Endpoint**: `GET /connectors/pancakeswap-sol/clmm/pool-info`
- **Description**: Fetch detailed information about a CLMM pool
- **Parameters**:
  - `network`: Solana network (mainnet-beta or devnet)
  - `poolAddress`: Pool address
- **Returns**: Pool info including tokens, price, liquidity, fees, tick spacing, etc.

#### 2. Position Info
- **Endpoint**: `GET /connectors/pancakeswap-sol/clmm/position-info`
- **Description**: Fetch information about a specific position NFT
- **Parameters**:
  - `network`: Solana network
  - `positionAddress`: Position NFT mint address
- **Returns**: Position details including price range, liquidity, fees earned, etc.

#### 3. Positions Owned
- **Endpoint**: `GET /connectors/pancakeswap-sol/clmm/positions-owned`
- **Description**: List all positions owned by a wallet in a specific pool
- **Parameters**:
  - `network`: Solana network
  - `poolAddress`: Pool address to filter by
  - `walletAddress`: Wallet address to query
- **Returns**: Array of position info for all positions in the specified pool
- **Note**: Queries both SPL Token and Token2022 programs for position NFTs

### Swap Routes (Implemented)

#### 4. Quote Swap
- **Endpoint**: `GET /connectors/pancakeswap-sol/clmm/quote-swap`
- **Description**: Get swap quote for a token pair (simplified - uses spot price)
- **Parameters**:
  - `network`: Solana network
  - `baseToken`: Base token symbol or address
  - `quoteToken`: Quote token symbol or address
  - `amount`: Amount to swap
  - `side`: Trade direction (BUY or SELL)
  - `poolAddress`: Pool address (optional)
  - `slippagePct`: Slippage percentage (default: 1%)
- **Returns**: Quote including price, amounts, and slippage protection
- **Limitations**:
  - Uses current pool spot price (no tick calculations)
  - Does not calculate price impact across ticks
  - Does not account for liquidity depth
  - Suitable for small trades where price impact is minimal

#### 5. Execute Swap
- **Endpoint**: `POST /connectors/pancakeswap-sol/clmm/execute-swap`
- **Description**: Execute a swap on PancakeSwap Solana CLMM
- **Parameters**:
  - `network`: Solana network
  - `walletAddress`: Wallet address to execute swap
  - `baseToken`: Base token symbol or address
  - `quoteToken`: Quote token symbol or address
  - `amount`: Amount to swap
  - `side`: Trade direction (BUY or SELL)
  - `poolAddress`: Pool address (optional)
  - `slippagePct`: Slippage percentage (default: 1%)
- **Returns**: Transaction signature and balance changes
- **Implementation**:
  - Manual transaction building using Anchor's BorshCoder
  - Encodes swap_v2 instruction with proper accounts
  - Includes compute budget and priority fees
  - Simulates before sending

## Not Yet Implemented

### Position Management Routes (Pending)

The following position management routes require more complex instruction building:

Routes pending implementation:
- ❌ `POST /open-position` - Open a new CLMM position (requires NFT minting)
- ❌ `POST /close-position` - Close an existing position
- ❌ `POST /add-liquidity` - Add liquidity to a position
- ❌ `POST /remove-liquidity` - Remove liquidity from a position
- ❌ `POST /collect-fees` - Collect accumulated fees
- ❌ `GET /quote-position` - Quote amounts for position operations (requires tick math)

## Example Usage

### Get Pool Info
```bash
curl "http://localhost:15888/connectors/pancakeswap-sol/clmm/pool-info?network=mainnet-beta&poolAddress=DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ"
```

### Get Position Info
```bash
curl "http://localhost:15888/connectors/pancakeswap-sol/clmm/position-info?network=mainnet-beta&positionAddress=F1xRqqbWdg3vdMEsn9YjRU7RnFVn67MZhDVXrWoobii5"
```

### Get Positions Owned
```bash
curl "http://localhost:15888/connectors/pancakeswap-sol/clmm/positions-owned?network=mainnet-beta&poolAddress=DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ&walletAddress=<YOUR_WALLET>"
```

### Quote Swap
```bash
# SELL 0.01 SOL for USDC
curl "http://localhost:15888/connectors/pancakeswap-sol/clmm/quote-swap?network=mainnet-beta&baseToken=SOL&quoteToken=USDC&amount=0.01&side=SELL&poolAddress=DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ"

# BUY 0.01 SOL with USDC
curl "http://localhost:15888/connectors/pancakeswap-sol/clmm/quote-swap?network=mainnet-beta&baseToken=SOL&quoteToken=USDC&amount=0.01&side=BUY&poolAddress=DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ"
```

### Execute Swap
```bash
# SELL 0.01 SOL for USDC
curl -X POST "http://localhost:15888/connectors/pancakeswap-sol/clmm/execute-swap" \
  -H "Content-Type: application/json" \
  -d '{
    "network": "mainnet-beta",
    "walletAddress": "<YOUR_WALLET>",
    "baseToken": "SOL",
    "quoteToken": "USDC",
    "amount": 0.01,
    "side": "SELL",
    "poolAddress": "DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ",
    "slippagePct": 1
  }'
```

## Testing

Run the connector tests:
```bash
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/pancakeswap-sol/pancakeswap-sol.test.ts
```

## Technical Details

### Account Data Decoding

The connector manually decodes account data for read operations:

#### PoolState Account
- **Discriminator**: 8 bytes
- **Structure**: Contains pool configuration, token mints, vaults, liquidity, price, fees
- **Fields Extracted**:
  - amm_config: Pool configuration account
  - token_mint_0, token_mint_1: Token mints
  - token_vault_0, token_vault_1: Vault addresses
  - observation_state: Oracle observation account
  - tick_spacing, liquidity, sqrt_price_x64, tick_current
- **Decoding**: Uses Buffer methods to read fields at specific byte offsets

#### PersonalPositionState Account
- **Discriminator**: 8 bytes (from PDA derived from NFT mint)
- **Structure**: Contains position bounds, liquidity, fees owed
- **Decoding**: Reads from PDA `[b"position", nft_mint]`

### Transaction Building

For swap execution, the connector uses Anchor's instruction encoding:

#### Instruction Encoding
```typescript
const coder = new BorshCoder(clmmIdl);
const instructionData = coder.instruction.encode('swap_v2', {
  amount,
  otherAmountThreshold,
  sqrtPriceLimitX64,
  isBaseInput,
});
```

#### Account Resolution
- Parses pool data to extract required accounts (vaults, observation, config)
- Derives user token accounts using getAssociatedTokenAddressSync
- Builds TransactionInstruction with all 13 required accounts

#### Transaction Construction
- Adds ComputeBudgetProgram instructions (compute units, priority fee)
- Builds VersionedTransaction with TransactionMessage
- Signs with wallet keypair
- Simulates before sending

### Price Calculations

Prices are calculated from the on-chain sqrt price using the formula:
```typescript
const sqrtPrice = Number(sqrtPriceX64) / Math.pow(2, 64);
const price = Math.pow(sqrtPrice, 2);
const adjustedPrice = price * Math.pow(10, decimalDiff);
```

Tick-to-price conversions use:
```typescript
const price = Math.pow(1.0001, tick) * Math.pow(10, decimalDiff);
```

## Future Work

### Position Management
To implement position management routes, we need to:
1. Implement NFT minting logic for position creation
2. Add tick math for precise position quoting (similar to Raydium SDK)
3. Build instructions for addLiquidity, removeLiquidity, collectFees
4. Implement liquidity calculation math across tick ranges

### Improved Swap Quoting
For production-grade swap quoting:
1. Fetch and parse tick array accounts
2. Implement concentrated liquidity math to calculate exact output
3. Calculate price impact based on available liquidity
4. Account for fees at each tick

### Testing
- Needs testing with funded wallet for execute-swap
- Integration tests for position management routes
- End-to-end tests with real pool operations

## References

- [PancakeSwap Solana CLMM Program](https://solscan.io/account/HpNfyc2Saw7RKkQd8nEL4khUcuPhQ7WwY1B2qjx8jxFq)
- [Example Pool (SOL/USDC)](https://solscan.io/account/DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ)
- [Raydium IDL Reference](https://github.com/raydium-io/raydium-idl)

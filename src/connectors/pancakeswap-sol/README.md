# PancakeSwap Solana CLMM Connector

This connector provides integration with PancakeSwap's Concentrated Liquidity Market Maker (CLMM) pools on Solana.

## Overview

PancakeSwap Solana is a fork of Raydium CLMM using the same IDL but with a different program ID:
- **Program ID**: `HpNfyc2Saw7RKkQd8nEL4khUcuPhQ7WwY1B2qjx8jxFq`
- **IDL**: Same as Raydium CLMM (amm_v3)

## Implementation Approach

This connector uses **manual buffer decoding** to read on-chain account data directly, avoiding the need for Anchor Program clients or SDKs. This approach:
- ✅ Works with PancakeSwap's different program ID
- ✅ Provides read-only pool and position information
- ❌ Does not yet support transaction building (write operations)

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

## Not Yet Implemented

### Transaction Routes (Require SDK or Manual Instruction Building)

The following routes require building and signing Solana transactions with PancakeSwap CLMM instructions. These are not yet implemented because they require either:
1. A dedicated PancakeSwap Solana SDK (doesn't exist yet)
2. Manual implementation of instruction encoding and transaction building
3. Forking the Raydium SDK with PancakeSwap's program ID

Routes pending implementation:
- ❌ `POST /open-position` - Open a new CLMM position
- ❌ `POST /close-position` - Close an existing position
- ❌ `POST /add-liquidity` - Add liquidity to a position
- ❌ `POST /remove-liquidity` - Remove liquidity from a position
- ❌ `POST /collect-fees` - Collect accumulated fees
- ❌ `GET /quote-position` - Quote amounts for position operations
- ❌ `GET /quote-swap` - Quote swap amounts
- ❌ `POST /execute-swap` - Execute a swap

### Quote Routes (Require Complex AMM Math)

Quote routes require implementing the concentrated liquidity math formulas (tick-to-price conversions, liquidity calculations, etc.) which are currently provided by the Raydium SDK. These could be implemented but would require significant effort.

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

## Testing

Run the connector tests:
```bash
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/pancakeswap-sol/pancakeswap-sol.test.ts
```

## Technical Details

### Account Data Decoding

The connector manually decodes two account types:

#### PoolState Account
- **Discriminator**: 8 bytes
- **Structure**: Contains pool configuration, token mints, liquidity, price, fees
- **Decoding**: Uses Buffer methods to read fields at specific offsets

#### PersonalPositionState Account
- **Discriminator**: 8 bytes (from PDA derived from NFT mint)
- **Structure**: Contains position bounds, liquidity, fees owed
- **Decoding**: Reads from PDA `[b"position", nft_mint]`

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

To implement transaction routes, we need to:
1. Build instruction encoders for PancakeSwap CLMM instructions
2. Create transaction builders that assemble instructions with proper accounts
3. Handle compute budget, priority fees, and transaction signing
4. Implement position creation logic including NFT minting
5. Add liquidity calculation math for concentrated liquidity

Alternatively, wait for PancakeSwap to release an official Solana SDK.

## References

- [PancakeSwap Solana CLMM Program](https://solscan.io/account/HpNfyc2Saw7RKkQd8nEL4khUcuPhQ7WwY1B2qjx8jxFq)
- [Example Pool (SOL/USDC)](https://solscan.io/account/DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ)
- [Raydium IDL Reference](https://github.com/raydium-io/raydium-idl)

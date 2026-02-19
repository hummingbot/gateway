# PR Summary: PancakeSwap CLMM LP Management & MasterChef Integration on BSC

## What's Included

This PR adds complete PancakeSwap CLMM (Concentrated Liquidity Market Maker) position management and MasterChef staking integration on BSC.

## Key Features Added

### 1. MasterChef Staking System
- **`POST /connectors/pancakeswap/clmm/masterchef-stake`** - Stake LP NFT positions in MasterChef
  - Validates NFT ownership and pool registration
  - Checks MasterChef approval before transfer
  - Returns detailed error messages with actionable steps
  
- **`POST /connectors/pancakeswap/clmm/masterchef-unstake`** - Unstake LP NFT from MasterChef
  - Properly uses MasterChef `withdraw()` function
  - Returns collected rewards to wallet
  
- **`POST /connectors/pancakeswap/clmm/masterchef-unstake-and-close`** ✨ NEW
  - Convenience endpoint: unstakes NFT and immediately closes position
  - Removes liquidity, collects fees, burns NFT in one call
  
- **`POST /connectors/pancakeswap/clmm/masterchef-knows-pool`** ✨ NEW
  - Checks if a pool is registered in MasterChef
  - Returns pool ID for registered pools

### 2. Critical Fixes
- **BigInt Conversion Error** - Fixed "Cannot convert X to BigInt" when executing swaps with decimal amounts
- **Amount Handling** - Enhanced `openPosition` and `quoteSwap` to properly handle numeric values
- **Error Messages** - Improved user-facing error messages with specific instructions

### 3. BSC Network Support  
- New `/chain/bsc/balances` endpoint for getting BSC wallet balances
- Wallet management support for BSC (wallets stored alongside Ethereum)
- Proper network routing for all operations

### 4. Enhanced Parameters
- `positionsOwned` - Added `activeOnly` filter to show only positions with active liquidity
- `executeSwap` - Added optional `poolAddress` parameter for manual pool selection
- `masterchef-stake/unstake` - Added `walletAddress` parameter for transaction signing

## Files Modified

### Core Implementation (5 files)
- `src/connectors/pancakeswap/pancakeswap.ts` - MasterChef integration methods
- `src/connectors/pancakeswap/clmm-routes/index.ts` - Route registration
- `src/connectors/pancakeswap/clmm-routes/masterchef-stake.ts` - Staking endpoint
- `src/connectors/pancakeswap/clmm-routes/masterchef-unstake.ts` - Unstaking endpoint
- `src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json` ✨ NEW - MasterChef ABI

### New Endpoints (2 files)
- `src/connectors/pancakeswap/clmm-routes/masterchef-unstake-and-close.ts` ✨ NEW
- `src/connectors/pancakeswap/clmm-routes/masterchef-knows-pool.ts` ✨ NEW

### Fixes & Enhancements (5 files)
- `src/connectors/pancakeswap/clmm-routes/quoteSwap.ts` - BigInt fixes
- `src/connectors/pancakeswap/clmm-routes/openPosition.ts` - Amount handling
- `src/connectors/pancakeswap/clmm-routes/positionsOwned.ts` - activeOnly parameter
- `src/connectors/pancakeswap/clmm-routes/positionInfo.ts` - Error handling
- `src/connectors/pancakeswap/schemas.ts` - Schema updates

### BSC Support (4 files)
- `src/wallet/schemas.ts` - BSC chain support
- `src/wallet/utils.ts` - BSC wallet handling
- `src/chains/bsc/bsc.routes.ts` ✨ NEW - BSC route registration
- `src/chains/bsc/routes/balances.ts` ✨ NEW - BSC balance endpoint

## Testing Checklist

Before merging, verify:

- [ ] `POST /connectors/pancakeswap/clmm/masterchef-stake` succeeds (after NFT approval)
- [ ] `POST /connectors/pancakeswap/clmm/execute-swap` handles decimal amounts correctly
- [ ] `POST /connectors/pancakeswap/clmm/open-position` accepts string and number inputs
- [ ] `POST /connectors/pancakeswap/clmm/masterchef-unstake-and-close` completes both operations
- [ ] `/chain/bsc/balances` returns correct wallet balances
- [ ] Wallets can be added/retrieved with chain='bsc'

## Value Conversions Corrected

All the following value conversion issues were fixed:

1. **BigInt Scientific Notation** - Raw amounts now returned as full precision strings
2. **Decimal Input Handling** - Amounts can be passed as decimals (0.032, 1.52938, etc.)
3. **String/Number Flexibility** - Functions handle both string and numeric inputs

## Breaking Changes

None. All changes are backward compatible with existing endpoints.

## Migration Steps

1. Create feature branch from `develop`: `git checkout -b pancakeswap-clmm-lp-bsc`
2. Apply files listed in MIGRATION_GUIDE.md (see .DesignDocs/MIGRATION_GUIDE.md)
3. Run test suite
4. One-time setup: Call `setApprovalForAll` on NonfungiblePositionManager for MasterChef address

## Related Issues

- Resolves MasterChef integration for LP position staking
- Fixes BigInt conversion errors in token swap operations
- Adds comprehensive BSC network support

---

**Total Files Changed**: 16
**New Files**: 6
**Modified Files**: 10

See `MIGRATION_GUIDE.md` for complete file-by-file breakdown and implementation instructions.

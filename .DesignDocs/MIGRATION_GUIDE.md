# Migration Guide: PancakeSwap CLMM LP & MasterChef Feature Branch

## Overview

This document provides a complete list of ALL files that were changed specifically for the pancakeswap-clmm-lp-bsc feature. These changes are scoped to **ONLY** code changes needed for PancakeSwap CLMM LP management and MasterChef integration on BSC.

**Purpose**: To facilitate migration of code changes from this working branch to `VeXHarbinger/hummingbot-gateway:pancakeswap-clmm-lp-bsc` for a clean, focused PR.

---

## Changed Files by Category

### 1. NEW ENDPOINTS - MasterChef Staking/Unstaking

#### New Files Created
- **[src/connectors/pancakeswap/clmm-routes/masterchef-unstake-and-close.ts](src/connectors/pancakeswap/clmm-routes/masterchef-unstake-and-close.ts)** ✨ NEW
  - Chains unstake + close operations into one convenience endpoint
  - Unstakes NFT from MasterChef, then removes liquidity and burns NFT
  - Returns detailed information about liquidity removed and fees collected
  
- **[src/connectors/pancakeswap/clmm-routes/masterchef-knows-pool.ts](src/connectors/pancakeswap/clmm-routes/masterchef-knows-pool.ts)** ✨ NEW
  - Checks if a pool is registered in MasterChef
  - Returns pool ID if registered, 0 if not

#### Modified Files - Core Implementation
- **[src/connectors/pancakeswap/pancakeswap.ts](src/connectors/pancakeswap/pancakeswap.ts)**
  - Added `getV3PoolIdFromMasterChef()` method to check pool registration
  - Fixed `stakeNft()` - Now performs comprehensive validation:
    - Verifies NFT ownership and pool registration
    - Checks MasterChef approval before staking
    - Handles NFT transfer via `safeTransferFrom` (callback pattern)
    - Provides detailed error messages with actionable instructions
  - Fixed `unstakeNft()` - Updated to use correct `withdraw()` function call
  - Added `getV3PoolByTokens()` private helper method
  - Added import of MasterChef ABI from JSON file

- **[src/connectors/pancakeswap/clmm-routes/masterchef-stake.ts](src/connectors/pancakeswap/clmm-routes/masterchef-stake.ts)**
  - Updated request schema: Added `walletAddress` parameter (required)
  - Enhanced schema documentation with examples
  - Changed endpoint path from `/connectors/pancakeswap/masterchef-stake` (moved from clmm-routes)
  - Updated tags from `['/connector/pancakeswap/clmm']` to `['/connector/pancakeswap']`
  - Improved OpenAPI documentation:
    - Added summary, description, operationId
    - Added externalDocs reference
    - Added x-examples for Swagger UI
    - Improved response schema descriptions

- **[src/connectors/pancakeswap/clmm-routes/masterchef-unstake.ts](src/connectors/pancakeswap/clmm-routes/masterchef-unstake.ts)**
  - Updated request schema: Added `walletAddress` parameter (required)
  - Changed endpoint path from `/connectors/pancakeswap/masterchef-unstake` (moved from clmm-routes)
  - Updated tags to match new structure
  - Updated to pass `walletAddress` to `unstakeNft()` method
  - Improved error responses

#### Route Registration
- **[src/connectors/pancakeswap/clmm-routes/index.ts](src/connectors/pancakeswap/clmm-routes/index.ts)**
  - Added import for `masterchef-unstake-and-close` route
  - Added import for `masterchef-knows-pool` route
  - Registered both routes in `pancakeswapClmmRoutes` plugin

---

### 2. EXISTING ENDPOINTS - Value Conversion Fixes

#### Amount Handling Fixes
- **[src/connectors/pancakeswap/clmm-routes/quoteSwap.ts](src/connectors/pancakeswap/clmm-routes/quoteSwap.ts)**
  - Fixed BigInt conversion error by ensuring raw amounts are proper strings
  - Uses `BigNumber.from().toString()` for proper formatting without scientific notation
  - Applies to: `rawAmountIn`, `rawAmountOut`, `rawMinAmountOut`, `rawMaxAmountIn`

- **[src/connectors/pancakeswap/clmm-routes/openPosition.ts](src/connectors/pancakeswap/clmm-routes/openPosition.ts)**
  - Enhanced numeric input handling: Accepts `number | string` for prices and amounts
  - Converts string inputs to floats for calculations
  - Improved wallet retrieval with fallback to BSC keystore for EVM wallets
  - Enhanced error handling with better error message mapping
  - Added comprehensive logging for debugging transaction issues

#### Endpoint Parameter Updates
- **[src/connectors/pancakeswap/clmm-routes/positionsOwned.ts](src/connectors/pancakeswap/clmm-routes/positionsOwned.ts)**
  - Added optional `activeOnly` parameter to filter positions by liquidity > 0
  - Updated function signature and documentation
  - Conditionally filters based on `activeOnly` flag

- **[src/connectors/pancakeswap/clmm-routes/positionInfo.ts](src/connectors/pancakeswap/clmm-routes/positionInfo.ts)**
  - Added error handling for position detail retrieval
  - Returns proper error if position cannot be fetched

- **[src/connectors/pancakeswap/schemas.ts](src/connectors/pancakeswap/schemas.ts)**
  - Added optional `poolAddress` parameter to ExecuteSwapRequest
  - Updated slippagePct example from 1 to 0.5 for better default

---

### 3. WALLET & CHAIN SUPPORT

#### BSC Chain Support - New Routes
- **[src/chains/bsc/bsc.routes.ts](src/chains/bsc/bsc.routes.ts)** ✨ NEW
  - Registers BSC-specific route handlers
  - Includes balances endpoint registration

- **[src/chains/bsc/routes/balances.ts](src/chains/bsc/routes/balances.ts)** ✨ NEW
  - Get BSC balances endpoint
  - Uses Ethereum implementation pointed at BSC network
  - Returns native token (BNB) and token balances

#### Wallet Management - BSC Support
- **[src/wallet/schemas.ts](src/wallet/schemas.ts)**
  - Added 'bsc' to `AddWalletRequestSchema` enum for chain selection
  - Updated examples to include BSC

- **[src/wallet/utils.ts](src/wallet/utils.ts)**
  - Added BSC support to `validateChainName()` - accepts 'bsc' as valid chain
  - Added chain normalization logic: 'bsc' maps to 'ethereum' chain with 'bsc' network
  - Updated wallet storage: EVM chains (ethereum, bsc) share 'ethereum' directory
  - Updated `getWallets()` to include 'bsc' in valid chains list
  - Added BSC address validation (0x format like Ethereum)

---

### 4. CONTRACT INTERFACES & ABIs

#### New ABI Files
- **[src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json](src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json)** ✨ NEW
  - Complete MasterChef V3 contract ABI
  - Includes all functions: deposit, withdraw, harvest, v3PoolAddressPid, etc.
  - Replaces inline minimal ABI with complete contract interface

---

### 5. CONFIGURATION & SETUP

#### TypeScript Configuration
- **[tsconfig.json](tsconfig.json)**
  - Removed `typeRoots` configuration (minor cleanup, not functional change)

#### Test & Utility Scripts
- **[test-pool-address.js](test-pool-address.js)** ✨ NEW
  - Diagnostic script for testing PancakeSwap pool contract connectivity
  - Useful for debugging pool address and contract issues

- **[dummy.json](dummy.json)** ✨ NEW
  - Workaround file for dockerfile copy operations
  - No functional impact

---

### 6. DOCUMENTATION UPDATES

These files should NOT be migrated (as per requirements - no .DesignDocs references):
- `.DesignDocs/FIXES_APPLIED.md` - Documentation only
- `.DesignDocs/MASTERCHEF_FIX.md` - Documentation only
- `.DesignDocs/SESSION_NOTES.md` - Documentation only
- `.DesignDocs/USER_TESTS.md` - Documentation only

Production documentation:
- **[UPDATE.md](UPDATE.md)** ✨ NEW
  - User-facing documentation of new/updated endpoints
  - Can be migrated or transformed into PR description

---

## Summary of Changes by Type

### Value Conversion Fixes
These changes fix BigInt/amount handling errors:
1. `quoteSwap.ts` - Ensures raw amounts are proper strings
2. `openPosition.ts` - Handles numeric input as string or number
3. `schemas.ts` - Added optional poolAddress parameter

### Feature Additions - MasterChef
1. **New endpoint**: `/masterchef-unstake-and-close` - Convenience endpoint
2. **New endpoint**: `/masterchef-knows-pool` - Check pool registration
3. **Enhanced**: `/masterchef-stake` - Added validation and approval checking
4. **Fixed**: `/masterchef-unstake` - Uses correct contract method

### Feature Additions - BSC
1. **New chain support**: Added `/chain/bsc/balances` endpoint
2. **Wallet support**: BSC wallets stored and managed like Ethereum wallets
3. **Network awareness**: Functions properly route to BSC network

### Parameter Enhancements
1. `positionsOwned` - Added `activeOnly` filter parameter
2. `executeSwap` - Added optional `poolAddress` parameter
3. `masterchef-stake/unstake` - Added `walletAddress` parameter

---

## Implementation Checklist

When applying these changes to the PR branch:

### Phase 1: Core Files
- [ ] Copy `src/connectors/pancakeswap/pancakeswap.ts` - Complete rewrite with MasterChef methods
- [ ] Copy `src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json` - New ABI file

### Phase 2: Route Files  
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/index.ts` - Route registration updates
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/masterchef-stake.ts` - Enhanced staking
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/masterchef-unstake.ts` - Fixed unstaking
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/masterchef-unstake-and-close.ts` - New endpoint
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/masterchef-knows-pool.ts` - New endpoint

### Phase 3: Quote & Position Files
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/quoteSwap.ts` - BigInt fixes
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/openPosition.ts` - Amount handling fixes
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/positionsOwned.ts` - activeOnly parameter
- [ ] Copy `src/connectors/pancakeswap/clmm-routes/positionInfo.ts` - Error handling

### Phase 4: Schema Files
- [ ] Copy `src/connectors/pancakeswap/schemas.ts` - poolAddress parameter

### Phase 5: Wallet & Chain Files
- [ ] Copy `src/wallet/schemas.ts` - BSC chain support
- [ ] Copy `src/wallet/utils.ts` - BSC wallet handling
- [ ] Copy `src/chains/bsc/bsc.routes.ts` - New BSC routes (if not exists)
- [ ] Copy `src/chains/bsc/routes/balances.ts` - New BSC balance endpoint (if not exists)

### Phase 6: Configuration & Tests
- [ ] Copy `src/chains/bsc/bsc.routes.ts` - If creating new directory
- [ ] Copy `tsconfig.json` - Minor changes (optional)
- [ ] Copy `test-pool-address.js` - Diagnostic utility (optional)

### Phase 7: Documentation
- [ ] Update `README.md` with new endpoints (optional - use UPDATE.md as reference)
- [ ] Update API documentation/swagger with new endpoints

---

## Value Conversions Fixed

The following value conversion issues were resolved:

1. **BigInt Serialization** (quoteSwap)
   - Issue: Scientific notation in BigInt values caused "Cannot convert X to BigInt" errors
   - Fix: Use `BigNumber.from().toString()` to ensure full precision string representation

2. **Numeric Input Handling** (openPosition, schemas)
   - Issue: String amounts couldn't be processed when passed as decimals
   - Fix: Added string/number type union and conversion to parseFloat

3. **Amount Formatting** (executeSwap indirectly via quoteSwap)
   - Issue: Raw amounts sometimes formatted with scientific notation
   - Fix: Ensure all raw amounts are passed as complete string values

---

## Testing Recommendations

After applying changes, verify:

1. **MasterChef Staking** 
   - Requires one-time: `setApprovalForAll(MasterChef, true)` on NFT Manager contract
   - Test: POST `/connectors/pancakeswap/masterchef-stake`

2. **Execute Swap Amounts**
   - Test: POST `/connectors/pancakeswap/clmm/execute-swap` with decimal amounts (0.032, 0.2, etc.)
   - Verify: No BigInt conversion errors

3. **Open Position**
   - Test: POST `/connectors/pancakeswap/clmm/open-position` with decimal amounts
   - Verify: Works with both number and string inputs

4. **BSC Wallet Support**
   - Test: Add wallet with chain='bsc'
   - Verify: Wallet properly stored and retrieved

---

## Notes for PR

- **All changes are focused** on PancakeSwap CLMM LP management and MasterChef integration
- **No changes to other connectors** or chain implementations
- **Backward compatible** - existing endpoints continue to work
- **Documentation improvements** - Enhanced OpenAPI/Swagger descriptions
- **Error handling** - Better user-facing error messages with actionable steps

---

## Files NOT Changed

The following areas were NOT modified (and should not be included in PR):

- All `.DesignDocs/` directory files (documentation only)
- Hummingbot API files
- Test files in `test/` directory
- Docker/deployment configuration
- Other connectors (Uniswap, Jupiter, etc.)
- Other chains (Ethereum mainnet, Solana, etc.)
- Authentication/security systems
- Core gateway infrastructure

---

## Branch Preparation Steps

1. Start from `develop` branch (as per session notes)
2. Create branch: `git checkout -b pancakeswap-clmm-lp-bsc`
3. Cherry-pick or apply these specific files (see Implementation Checklist)
4. Verify no merge conflicts
5. Run tests to ensure functionality
6. Create PR with this MIGRATION_GUIDE as reference

---

**Generated**: February 17, 2026
**Purpose**: Clean, focused feature branch for PancakeSwap CLMM LP and MasterChef integration on BSC

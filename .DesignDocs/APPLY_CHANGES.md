# Quick Reference: Files to Copy/Modify for pancakeswap-clmm-lp-bsc Branch

## STEP 1: Create Feature Branch from develop

```bash
git checkout develop
git pull upstream develop
git checkout -b feat/pancakeswap-clmm-masterchef-bsc upstream/develop
```

---

## STEP 2: Create New Files (5 files)

### 1. src/connectors/pancakeswap/clmm-routes/masterchef-unstake-and-close.ts
**Status**: ✨ NEW
**Source**: Current main branch
**Size**: ~154 lines

### 2. src/connectors/pancakeswap/clmm-routes/masterchef-knows-pool.ts
**Status**: ✨ NEW
**Source**: Current main branch
**Size**: ~63 lines

### 3. src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json
**Status**: ✨ NEW
**Source**: Current main branch
**Size**: ~65 lines (JSON ABI)

### 4. src/chains/bsc/bsc.routes.ts
**Status**: ✨ NEW
**Source**: Current main branch
**Size**: ~14 lines

### 5. src/chains/bsc/routes/balances.ts
**Status**: ✨ NEW
**Source**: Current main branch
**Size**: ~63 lines

---

## STEP 3: Modify Existing Files (11 files)

### Core PancakeSwap Files

#### 1. src/connectors/pancakeswap/pancakeswap.ts
**Changes**:
- Add `getV3PoolIdFromMasterChef(poolAddress)` method
- Add `getV3PoolByTokens(token0, token1, fee)` method
- Rewrite `stakeNft(tokenId, walletAddress)` with full validation
- Rewrite `unstakeNft(tokenId, walletAddress)` with correct function
- Add import: `import PancakeswapV3MasterchefABI from './PancakeswapV3Masterchef.abi.json'`
- Update MasterChef contract init to use full ABI

#### 2. src/connectors/pancakeswap/clmm-routes/index.ts
**Changes**:
- Add import for masterchef-unstake-and-close route
- Add import for masterchef-knows-pool route
- Register both routes in pancakeswapClmmRoutes

#### 3. src/connectors/pancakeswap/clmm-routes/masterchef-stake.ts
**Changes**:
- Add `walletAddress` to schema (required)
- Update endpoint path to `/masterchef-stake`
- Update tags to `['/connector/pancakeswap']`
- Add `walletAddress` to request handler
- Pass `walletAddress` to `stakeNft()`
- Add OpenAPI docs (summary, description, examples)

#### 4. src/connectors/pancakeswap/clmm-routes/masterchef-unstake.ts
**Changes**:
- Add `walletAddress` to schema (required)
- Update endpoint path to `/masterchef-unstake`
- Update tags to `['/connector/pancakeswap']`
- Add `walletAddress` to request handler
- Pass `walletAddress` to `unstakeNft()`

---

### Fix & Enhancement Files

#### 5. src/connectors/pancakeswap/clmm-routes/quoteSwap.ts
**Changes**:
- Modify raw amount formatting in `quoteClmmSwap()`:
  ```typescript
  const rawAmountInStr = BigNumber.from(trade.inputAmount.quotient.toString()).toString();
  const rawAmountOutStr = BigNumber.from(trade.outputAmount.quotient.toString()).toString();
  const rawMinAmountOutStr = BigNumber.from(minAmountOut).toString();
  const rawMaxAmountInStr = BigNumber.from(maxAmountIn).toString();
  ```
- Return these formatted values instead of direct quotient/calculation results

#### 6. src/connectors/pancakeswap/clmm-routes/openPosition.ts
**Changes**:
- Update function parameters from `number` to `number | string`:
  - `lowerPrice`
  - `upperPrice`
  - `baseTokenAmount`
  - `quoteTokenAmount`
- Add parseFloat conversions at start of function
- Use parsed values in calculations
- Add imports: `ConfigManagerCertPassphrase`, `getSafeWalletFilePath`, `fse`
- Add wallet retrieval fallback to BSC keystore
- Enhance error handling for common RPC errors

#### 7. src/connectors/pancakeswap/clmm-routes/positionsOwned.ts
**Changes**:
- Add `activeOnly` parameter to schema (optional, default false)
- Add `activeOnly` to function signature
- Update query handler to extract and pass `activeOnly`
- Modify position filtering: skip if `activeOnly && liquidity === 0`
- Update documentation to mention filter option

#### 8. src/connectors/pancakeswap/clmm-routes/positionInfo.ts
**Changes**:
- Add try-catch around `positionManager.positions()` call
- Return proper error if position not found
- Add logging for position retrieval errors

#### 9. src/connectors/pancakeswap/schemas.ts
**Changes**:
- Add optional `poolAddress` to `PancakeswapExecuteSwapRequest`
- Update slippagePct example from `1` to `0.5`

---

### Wallet & Chain Support

#### 10. src/wallet/schemas.ts
**Changes**:
- Add 'bsc' to `AddWalletRequestSchema` chain enum
- Update examples to include 'bsc'

#### 11. src/wallet/utils.ts
**Changes**:
- Update `validateChainName()` to accept 'bsc'
- Add chain normalization in `addWallet()`:
  - Map 'bsc' → 'ethereum' chain with 'bsc' network
- Update wallet storage path for EVM chains (shared 'ethereum' dir)
- Update `getWallets()` to include 'bsc' in valid chains
- Add BSC address validation (0x format)

---

## STEP 4: Verify All Files Present

```bash
# New files
ls src/connectors/pancakeswap/clmm-routes/masterchef-unstake-and-close.ts
ls src/connectors/pancakeswap/clmm-routes/masterchef-knows-pool.ts
ls src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json
ls src/chains/bsc/bsc.routes.ts
ls src/chains/bsc/routes/balances.ts

# Modified files
ls src/connectors/pancakeswap/pancakeswap.ts
ls src/connectors/pancakeswap/clmm-routes/index.ts
ls src/connectors/pancakeswap/clmm-routes/masterchef-stake.ts
ls src/connectors/pancakeswap/clmm-routes/masterchef-unstake.ts
ls src/connectors/pancakeswap/clmm-routes/quoteSwap.ts
ls src/connectors/pancakeswap/clmm-routes/openPosition.ts
ls src/connectors/pancakeswap/clmm-routes/positionsOwned.ts
ls src/connectors/pancakeswap/clmm-routes/positionInfo.ts
ls src/connectors/pancakeswap/schemas.ts
ls src/wallet/schemas.ts
ls src/wallet/utils.ts
```

---

## STEP 5: Commit Changes

```bash
# Commit 1: MasterChef endpoints and core fixes
git add src/connectors/pancakeswap/pancakeswap.ts \
         src/connectors/pancakeswap/clmm-routes/index.ts \
         src/connectors/pancakeswap/clmm-routes/masterchef-stake.ts \
         src/connectors/pancakeswap/clmm-routes/masterchef-unstake.ts \
         src/connectors/pancakeswap/clmm-routes/masterchef-unstake-and-close.ts \
         src/connectors/pancakeswap/clmm-routes/masterchef-knows-pool.ts \
         src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json

git commit -m "(feat) add MasterChef staking and unstaking endpoints

- Add masterchef-stake endpoint with NFT approval validation
- Add masterchef-unstake endpoint with reward collection  
- Add masterchef-unstake-and-close convenience endpoint
- Add masterchef-knows-pool pool registration check endpoint
- Fix stakeNft/unstakeNft to use correct MasterChef callback pattern
- Add comprehensive validation and error messages with action steps
- Replace inline ABI with complete MasterChefV3 ABI from JSON"

# Commit 2: Value conversion fixes
git add src/connectors/pancakeswap/clmm-routes/quoteSwap.ts \
         src/connectors/pancakeswap/clmm-routes/openPosition.ts \
         src/connectors/pancakeswap/schemas.ts

git commit -m "(fix) resolve BigInt conversion errors in swap operations

- Fix BigInt serialization in quoteSwap for proper amount formatting
- Add numeric input handling (string | number) to openPosition
- Ensure raw amounts use complete string representation without scientific notation
- Add parseFloat conversion for decimal amount inputs
- Resolves 'Cannot convert X to BigInt' error in execute-swap endpoint"

# Commit 3: Schema updates and filters
git add src/connectors/pancakeswap/clmm-routes/positionsOwned.ts \
         src/connectors/pancakeswap/clmm-routes/positionInfo.ts

git commit -m "(feat) enhance position management endpoints

- Add activeOnly filter to positions-owned endpoint
- Add error handling for position detail retrieval
- Improve logging for debugging position operations"

# Commit 4: BSC and wallet support
git add src/chains/bsc/bsc.routes.ts \
         src/chains/bsc/routes/balances.ts \
         src/wallet/schemas.ts \
         src/wallet/utils.ts

git commit -m "(feat) add BSC network and wallet support

- Add bsc chain support to wallet management
- Add /chain/bsc/balances endpoint for BSC wallet balances
- Map 'bsc' chain to ethereum implementation with bsc network
- Store EVM wallets (ethereum, bsc) in shared directory
- Add BSC address validation and route registration"
```

---

## STEP 6: Push and Create PR

```bash
git push origin feat/pancakeswap-clmm-masterchef-bsc
```

Then create PR on GitHub from your fork to `upstream/development` with this title:

```
[feat] PancakeSwap CLMM LP Management and MasterChef Integration on BSC
```

---

## STEP 7: Run Tests

```bash
# Build
npm run build
# or
pnpm build

# Run test suite
npm run test
# or  
pnpm test

# Check coverage
npm run test:cov
# or
pnpm test:cov
```

---

## TESTING VERIFICATION

After build/deployment, test these 9 scenarios (from PANCAKESWAP_CLMM_MIGRATION.md Section 6):

1. ✅ Quote Swap (decimal amounts - no BigInt errors)
2. ✅ Execute Swap (0.032 amount - should work)
3. ✅ Open Position (decimal prices and amounts)
4. ✅ MasterChef Stake (requires approval first)
5. ✅ MasterChef Knows Pool (check pool ID)
6. ✅ MasterChef Unstake (get rewards)
7. ✅ MasterChef Unstake & Close (2-in-1 convenience)
8. ✅ Positions Owned with activeOnly filter
9. ✅ BSC Wallet Balances

---

## FILES REFERENCE

For detailed information about each change:
- See `PANCAKESWAP_CLMM_MIGRATION.md` in root directory
- Sections 1-5: Detailed change descriptions
- Section 6: Complete testing steps with payloads
- Section 7: Commit message templates
- Section 9: Full file list

---

## TOTAL CHANGES

- **New Files**: 5
- **Modified Files**: 11
- **Total Files**: 16
- **Lines Added**: ~500+
- **Commits**: 4 focused commits
- **Test Cases**: 9 verification scenarios

Ready to apply! 🚀

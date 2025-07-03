# Raydium SDK V2 Upgrade Plan

## Overview

This document outlines the comprehensive plan for upgrading the Raydium connector from SDK version 0.1.58-alpha to 0.1.141-alpha, with alignment to the latest SDK V2 demo patterns.

## Current State Analysis

### Version Information
- **Current SDK Version**: 0.1.58-alpha
- **Target SDK Version**: 0.1.141-alpha
- **Version Gap**: 83 versions
- **Future Consideration**: 2.0.x release candidates available but not stable

### Current Implementation Structure
```
src/connectors/raydium/
├── raydium.ts                 # Main connector class
├── raydium.config.ts          # Configuration
├── raydium.utils.ts           # Utility functions
├── raydium.routes.ts          # Route definitions
├── amm-routes/                # AMM operations
│   ├── executeSwap.ts
│   ├── quoteSwap.ts
│   ├── addLiquidity.ts
│   ├── removeLiquidity.ts
│   └── ...
└── clmm-routes/               # CLMM operations
    ├── executeSwap.ts
    ├── quoteSwap.ts
    ├── openPosition.ts
    ├── closePosition.ts
    └── ...
```

## Key Changes Required

### 1. Method Name Updates (Already Compatible)
- ✅ `computeAmountOut` - Already using new name
- ✅ `computeAmountIn` - Already using new name
- ✅ Type naming conventions - Using latest types

### 2. Architectural Changes

#### Transaction Execution Pattern
**Current Pattern**:
```typescript
const tx = await raydium.buildTransaction(...)
const signed = await wallet.signTransaction(tx)
const txId = await connection.sendTransaction(signed)
```

**New Pattern**:
```typescript
const { execute } = await raydium.liquidity.swap({...})
const txId = await execute()
```

#### Pool Information Retrieval
**Current Pattern**:
```typescript
const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolId)
const rpcData = await raydium.raydiumSDK.liquidity.getRpcPoolInfo(poolId)
```

**New Pattern**:
```typescript
const poolInfo = await raydium.api.fetchPoolById({ ids: poolId })
const rpcPoolInfo = await raydium.liquidity.getRpcPoolInfo(poolId)
```

## Migration Phases

### Phase 1: SDK Version Update (Week 1)
**Risk Level**: Low  
**Estimated Time**: 2-3 days

#### Tasks:
1. **Update package.json**
   ```json
   "@raydium-io/raydium-sdk-v2": "0.1.141-alpha"
   ```

2. **Run dependency update**
   ```bash
   pnpm install
   pnpm build
   ```

3. **Fix compilation errors**
   - Address any type mismatches
   - Update import statements if needed
   - Handle any deprecated method warnings

4. **Run test suite**
   ```bash
   pnpm test:unit
   pnpm test:cov
   ```

5. **Manual testing checklist**
   - [ ] AMM swap quote
   - [ ] AMM swap execution
   - [ ] CLMM swap quote
   - [ ] CLMM swap execution
   - [ ] Add liquidity (AMM)
   - [ ] Remove liquidity (AMM)
   - [ ] Open position (CLMM)
   - [ ] Close position (CLMM)

### Phase 2: Adopt SDK V2 Patterns (Week 2-3)
**Risk Level**: Medium  
**Estimated Time**: 5-7 days

#### 2.1 Implement Execute Pattern

**File**: `src/connectors/raydium/raydium.ts`
```typescript
// Add new method to handle execute pattern
async executeTransaction(executeFunc: () => Promise<string>): Promise<string> {
  try {
    return await executeFunc();
  } catch (error) {
    // Handle errors consistently
    throw this.handleTransactionError(error);
  }
}
```

#### 2.2 Refactor AMM Swap Operations

**File**: `src/connectors/raydium/amm-routes/executeSwap.ts`
```typescript
// Refactor to use new swap pattern
const { execute } = await raydium.liquidity.swap({
  poolInfo,
  poolKeys,
  amountIn: new BN(amountIn),
  amountOut: minAmountOut,
  fixedSide: 'in',
  inputMint: inputToken.address,
  txVersion: TxVersion.V0,
  computeBudgetConfig: {
    units: computeUnits,
    microLamports: priorityFee,
  },
});

const txId = await raydium.executeTransaction(execute);
```

#### 2.3 Refactor CLMM Operations

**File**: `src/connectors/raydium/clmm-routes/executeSwap.ts`
```typescript
// Simplify CLMM swap execution
const { execute } = await raydium.clmm.swap({
  poolInfo,
  poolKeys,
  inputMint,
  amountIn,
  amountOutMin,
  observationId,
  ownerInfo: {
    useSOLBalance: true,
  },
  txVersion: TxVersion.V0,
});

const txId = await raydium.executeTransaction(execute);
```

#### 2.4 Update Pool Fetching Logic

**File**: `src/connectors/raydium/raydium.ts`
```typescript
// Unified pool fetching method
async getPoolInfo(poolId: string): Promise<PoolInfo> {
  const poolInfo = await this.raydiumSDK.api.fetchPoolById({ ids: poolId });
  if (!poolInfo) {
    throw new Error(`Pool not found: ${poolId}`);
  }
  return poolInfo;
}
```

### Phase 3: Simplify Architecture (Week 4)
**Risk Level**: High  
**Estimated Time**: 5-7 days

#### 3.1 Reduce Abstraction Layers

1. **Remove redundant type conversions**
   - Use SDK types directly
   - Eliminate unnecessary BN conversions
   - Simplify decimal handling

2. **Consolidate pool operations**
   - Merge AMM and CPMM logic where possible
   - Use unified pool interfaces
   - Reduce code duplication

3. **Streamline error handling**
   - Use SDK error types
   - Consistent error messages
   - Better error context

#### 3.2 Code Structure Improvements

```typescript
// Before: Complex manual calculation
const effectiveSlippage = slippagePct === undefined ? 0.01 : slippagePct / 100;
const minAmountOut = amountOut
  .mul(new BN(Math.floor((1 - effectiveSlippage) * 10000)))
  .div(new BN(10000));

// After: Use SDK utilities
const minAmountOut = PoolUtils.calculateMinAmountOut(amountOut, slippagePct);
```

#### 3.3 Testing Strategy

1. **Unit Tests**
   - Update mocks for new SDK methods
   - Test execute pattern implementation
   - Verify error handling

2. **Integration Tests**
   - Test against Solana devnet
   - Verify transaction success
   - Check balance changes

3. **Performance Tests**
   - Compare transaction times
   - Monitor RPC calls
   - Check memory usage

## Rollback Plan

### Preparation
1. Tag current version before starting upgrade
   ```bash
   git tag pre-raydium-upgrade-v0.1.58
   ```

2. Create feature branch
   ```bash
   git checkout -b feat/raydium-sdk-upgrade
   ```

### Rollback Steps
1. Revert to previous package.json
2. Run `pnpm install --force`
3. Rebuild and test
4. Deploy previous version

## Success Metrics

### Technical Metrics
- [ ] All tests passing (100% of existing tests)
- [ ] No regression in swap execution times
- [ ] Reduced code complexity (measured by cyclomatic complexity)
- [ ] Improved type safety (fewer `any` types)

### Functional Metrics
- [ ] All swap types working (AMM, CLMM, CPMM)
- [ ] Liquidity operations functional
- [ ] Position management working
- [ ] Error handling improved

## Risk Mitigation

### Known Risks
1. **Undocumented breaking changes**
   - Mitigation: Extensive testing on devnet
   - Fallback: Maintain compatibility layer

2. **Performance regression**
   - Mitigation: Benchmark before/after
   - Fallback: Optimize hot paths

3. **Third-party integration issues**
   - Mitigation: Test with Hummingbot
   - Fallback: Provide migration guide

### Monitoring Plan
1. Set up alerts for failed transactions
2. Monitor error rates post-deployment
3. Track performance metrics
4. User feedback collection

## Timeline Summary

| Phase | Duration | Risk | Start Date | End Date |
|-------|----------|------|------------|----------|
| Phase 1: SDK Update | 2-3 days | Low | TBD | TBD |
| Phase 2: Pattern Adoption | 5-7 days | Medium | TBD | TBD |
| Phase 3: Architecture | 5-7 days | High | TBD | TBD |
| Testing & Validation | 3-5 days | Low | TBD | TBD |
| **Total** | **15-22 days** | **Medium** | **TBD** | **TBD** |

## Post-Upgrade Tasks

1. **Documentation Updates**
   - Update API documentation
   - Create migration guide
   - Update example code

2. **Performance Optimization**
   - Profile transaction execution
   - Optimize RPC calls
   - Cache pool information

3. **Future Considerations**
   - Plan for 2.0.x stable release
   - Evaluate new features
   - Assess further optimizations

## Approval and Sign-off

- [ ] Technical Lead Review
- [ ] Security Review
- [ ] Performance Benchmarks
- [ ] Integration Tests Complete
- [ ] Documentation Updated
- [ ] Deployment Plan Approved

---

*Last Updated: [Current Date]*  
*Version: 1.0*  
*Author: [Your Name]*
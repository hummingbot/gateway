# PR #2: Complete Raydium SDK Extraction

**Branch**: `feature/sdk-raydium-complete`
**Base**: `feature/sdk-core-structure` (PR #1)
**Target**: Extract all remaining Raydium operations to SDK

---

## 📋 Overview

**Objective**: Extract all remaining Raydium AMM and CLMM operations from Gateway route handlers into pure SDK functions, following the pattern established in PR #1.

**Status**: ✅ Branch Created - Ready to Execute

---

## 🎯 Scope

### AMM Operations (7 total)
- ✅ **addLiquidity** - Already extracted in PR #1
- ❌ **removeLiquidity** - 284 lines, complex LP calculation logic
- ❌ **quoteLiquidity** - 249 lines, complex pair amount computation
- ❌ **quoteSwap** - ~300 lines (estimate)
- ❌ **executeSwap** - ~250 lines (estimate)
- ❌ **poolInfo** - 44 lines, simple query
- ❌ **positionInfo** - ~150 lines (estimate), query operation

### CLMM Operations (11 total)
- ❌ **openPosition** - 218 lines, complex transaction with quote integration
- ❌ **closePosition** - ~200 lines (estimate)
- ❌ **addLiquidity** - ~180 lines (estimate)
- ❌ **removeLiquidity** - ~180 lines (estimate)
- ❌ **collectFees** - ~150 lines (estimate)
- ❌ **positionsOwned** - ~100 lines (estimate), query operation
- ❌ **positionInfo** - ~80 lines (estimate), query operation
- ❌ **poolInfo** - ~50 lines (estimate), simple query
- ❌ **quotePosition** - ~250 lines (estimate)
- ❌ **quoteSwap** - ~300 lines (estimate)
- ❌ **executeSwap** - ~250 lines (estimate)

**Total**: 18 operations to extract

---

## 🏗️ Architecture

### Directory Structure

```
packages/sdk/src/solana/raydium/
├── connector.ts                    # ✅ Main RaydiumConnector class (PR #1)
├── index.ts                        # ✅ Exports (PR #1)
├── add-liquidity-operation.ts      # ✅ AMM AddLiquidity (PR #1)
│
├── operations/
│   ├── amm/
│   │   ├── add-liquidity.ts        # ✅ Already done
│   │   ├── remove-liquidity.ts     # ❌ New
│   │   ├── quote-liquidity.ts      # ❌ New
│   │   ├── quote-swap.ts           # ❌ New
│   │   ├── execute-swap.ts         # ❌ New
│   │   ├── pool-info.ts            # ❌ New
│   │   └── position-info.ts        # ❌ New
│   │
│   └── clmm/
│       ├── open-position.ts        # ❌ New
│       ├── close-position.ts       # ❌ New
│       ├── add-liquidity.ts        # ❌ New
│       ├── remove-liquidity.ts     # ❌ New
│       ├── collect-fees.ts         # ❌ New
│       ├── positions-owned.ts      # ❌ New
│       ├── position-info.ts        # ❌ New
│       ├── pool-info.ts            # ❌ New
│       ├── quote-position.ts       # ❌ New
│       ├── quote-swap.ts           # ❌ New
│       └── execute-swap.ts         # ❌ New
│
└── types/
    ├── amm.ts                      # ❌ New - AMM operation types
    └── clmm.ts                     # ❌ New - CLMM operation types
```

### Pattern from PR #1

Each operation follows this structure:

```typescript
// SDK Operation (packages/sdk/src/solana/raydium/operations/amm/add-liquidity.ts)
import { OperationBuilder } from '@protocol-sdk/core';

export class AddLiquidityOperation implements OperationBuilder<AddLiquidityParams, AddLiquidityResult> {
  constructor(private raydium: Raydium, private solana: Solana) {}

  async validate(params: AddLiquidityParams): Promise<ValidationResult> {
    // Parameter validation
  }

  async simulate(params: AddLiquidityParams): Promise<SimulationResult> {
    // Transaction simulation
  }

  async build(params: AddLiquidityParams): Promise<Transaction> {
    // Pure business logic extracted from route handler
    // Returns unsigned transaction
  }

  async execute(params: AddLiquidityParams): Promise<AddLiquidityResult> {
    // Optional: Build + sign + send
  }
}
```

```typescript
// API Route Handler (src/connectors/raydium/amm-routes/addLiquidity.sdk.ts)
import { RaydiumConnector } from '../../../../packages/sdk/src/solana/raydium';

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/add-liquidity-sdk', async (request) => {
    // Thin HTTP wrapper
    const raydium = await RaydiumConnector.getInstance(network);
    const transaction = await raydium.operations.addLiquidity.build(params);
    // ... sign and send
  });
};
```

---

## 📝 Execution Strategy

### Phase 1: Foundation (15 minutes)
- ✅ Create branch `feature/sdk-raydium-complete`
- ✅ Create PR #2 plan document
- [ ] Create type definitions for all operations
  - `packages/sdk/src/solana/raydium/types/amm.ts`
  - `packages/sdk/src/solana/raydium/types/clmm.ts`
- [ ] Create operations directory structure

### Phase 2: Query Operations (2 hours)
**Priority**: Start with simplest operations to establish rhythm

1. **AMM poolInfo** (30 min)
   - Extract from `src/connectors/raydium/amm-routes/poolInfo.ts`
   - Create `packages/sdk/src/solana/raydium/operations/amm/pool-info.ts`
   - Update route handler to thin wrapper

2. **AMM positionInfo** (30 min)
   - Extract from `src/connectors/raydium/amm-routes/positionInfo.ts`
   - Create SDK operation

3. **CLMM poolInfo** (30 min)
   - Extract from `src/connectors/raydium/clmm-routes/poolInfo.ts`

4. **CLMM positionInfo** (30 min)
   - Extract from `src/connectors/raydium/clmm-routes/positionInfo.ts`

5. **CLMM positionsOwned** (30 min)
   - Extract from `src/connectors/raydium/clmm-routes/positionsOwned.ts`

### Phase 3: Quote Operations (3 hours)
**Priority**: Medium complexity, no transaction building

1. **AMM quoteLiquidity** (60 min)
   - Extract from `src/connectors/raydium/amm-routes/quoteLiquidity.ts` (249 lines)
   - Handle both AMM and CPMM pool types
   - Complex pair amount calculation logic

2. **AMM quoteSwap** (60 min)
   - Extract from `src/connectors/raydium/amm-routes/quoteSwap.ts`
   - Route computation logic

3. **CLMM quotePosition** (45 min)
   - Extract from `src/connectors/raydium/clmm-routes/quotePosition.ts`
   - Tick/price calculations

4. **CLMM quoteSwap** (45 min)
   - Extract from `src/connectors/raydium/clmm-routes/quoteSwap.ts`

### Phase 4: Execute Operations - AMM (4 hours)
**Priority**: Complex transaction building

1. **AMM removeLiquidity** (90 min)
   - Extract from `src/connectors/raydium/amm-routes/removeLiquidity.ts` (284 lines)
   - LP amount calculation
   - Handle both AMM and CPMM types
   - Transaction signing logic

2. **AMM executeSwap** (90 min)
   - Extract from `src/connectors/raydium/amm-routes/executeSwap.ts`
   - Route execution
   - Slippage handling

### Phase 5: Execute Operations - CLMM (6 hours)
**Priority**: Most complex operations

1. **CLMM openPosition** (90 min)
   - Extract from `src/connectors/raydium/clmm-routes/openPosition.ts` (218 lines)
   - Price range validation
   - Tick calculations
   - Quote integration

2. **CLMM closePosition** (75 min)
   - Extract from `src/connectors/raydium/clmm-routes/closePosition.ts`
   - NFT burning
   - Liquidity withdrawal

3. **CLMM addLiquidity** (60 min)
   - Extract from `src/connectors/raydium/clmm-routes/addLiquidity.ts`
   - Existing position modification

4. **CLMM removeLiquidity** (60 min)
   - Extract from `src/connectors/raydium/clmm-routes/removeLiquidity.ts`
   - Partial withdrawal logic

5. **CLMM collectFees** (45 min)
   - Extract from `src/connectors/raydium/clmm-routes/collectFees.ts`
   - Fee collection logic

6. **CLMM executeSwap** (90 min)
   - Extract from `src/connectors/raydium/clmm-routes/executeSwap.ts`
   - CLMM swap execution

### Phase 6: Connector Integration (2 hours)
- [ ] Update `packages/sdk/src/solana/raydium/connector.ts`
  - Add all operations to `operations` object
  - Organize by AMM vs CLMM
- [ ] Update `packages/sdk/src/solana/raydium/index.ts`
  - Export all operation classes
  - Export all types
- [ ] Update `packages/sdk/src/index.ts`
  - Ensure proper SDK export structure

### Phase 7: Testing (3 hours)
- [ ] Create mock data for all operations
- [ ] Unit tests for each SDK operation
- [ ] Integration tests for API endpoints
- [ ] Smoke test on devnet

### Phase 8: Documentation (2 hours)
- [ ] Update operation documentation
- [ ] Create usage examples for all operations
- [ ] Update ARCHITECTURE.md
- [ ] Create PR description

### Phase 9: PR Creation (30 minutes)
- [ ] Final code review
- [ ] Run full test suite
- [ ] Create pull request
- [ ] Link to PR #1

---

## ⏱️ Time Estimates

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 1 | Foundation | 15 min |
| 2 | Query Operations (5) | 2.5 hours |
| 3 | Quote Operations (4) | 3 hours |
| 4 | AMM Execute Operations (2) | 3 hours |
| 5 | CLMM Execute Operations (6) | 6 hours |
| 6 | Connector Integration | 2 hours |
| 7 | Testing | 3 hours |
| 8 | Documentation | 2 hours |
| 9 | PR Creation | 30 min |
| **Total** | **18 operations** | **~22 hours** |

**Realistic Timeline**: 2-3 days (accounting for breaks, debugging, refinement)

---

## ✅ Success Criteria

- [ ] All 18 Raydium operations extracted to SDK
- [ ] All route handlers converted to thin HTTP wrappers
- [ ] Zero breaking changes to API endpoints
- [ ] All tests passing (unit + integration)
- [ ] Code coverage >75% for new SDK code
- [ ] Documentation complete with examples
- [ ] Devnet validation successful
- [ ] PR created and ready for review

---

## 🚀 Benefits

1. **Reusable Logic**: Business logic can be used in SDK mode or API mode
2. **Better Testing**: Pure functions are easier to test
3. **Type Safety**: Full TypeScript types throughout
4. **Maintainability**: Clear separation of concerns
5. **Foundation**: Pattern proven for all other connectors (PR #3)

---

## 📊 Progress Tracking

### Operations Extracted: 1/18 (5.5%)
- ✅ AMM: addLiquidity (PR #1)
- ❌ AMM: 6 remaining
- ❌ CLMM: 11 remaining

### Current Status: 🚀 Ready to Execute

---

## 🔗 Related

- **PR #1**: Core SDK Structure & Raydium AddLiquidity Extraction
- **PR #3**: Standardize All Connectors (Next)
- **Plan**: docs/Protocol_SDK_PLAN.md
- **Architecture**: docs/architecture/ARCHITECTURE.md

---

*Created: 2025-10-24*
*Status: In Progress*

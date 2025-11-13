# Phase 1: Gateway Schema Integration

**Status**: In Progress
**Goal**: Replace all duplicate type definitions with direct imports from Gateway schemas
**Estimated Time**: 2-3 hours
**Expected Outcome**: 100% type consistency with Gateway backend

---

## Architectural Overview

### Current Architecture (BEFORE)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Gateway Backend                          │
│                    /Users/feng/gateway/src/                      │
├─────────────────────────────────────────────────────────────────┤
│  schemas/                                                        │
│  ├── chain-schema.ts      (TokensResponseType, BalanceResponse) │
│  ├── clmm-schema.ts       (PositionInfo, PoolInfo)             │
│  ├── amm-schema.ts        (PoolInfo, QuoteResponse)            │
│  └── router-schema.ts     (QuoteResponse, ExecuteResponse)     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP API
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Gateway App Frontend                        │
│              /Users/feng/gateway/gateway-app/src/               │
├─────────────────────────────────────────────────────────────────┤
│  lib/utils.ts                                                   │
│  ├── ❌ TokenInfo (duplicate)                                   │
│  └── getSelectableTokenList()                                  │
│                                                                 │
│  components/PortfolioView.tsx                                  │
│  ├── ❌ Balance (custom)                                        │
│  ├── ❌ Position (duplicate)                                    │
│  └── ❌ ConnectorConfig (duplicate)                            │
│                                                                 │
│  components/PoolsView.tsx                                      │
│  ├── ❌ Pool (custom)                                           │
│  ├── ❌ PoolInfo (duplicate)                                    │
│  ├── ❌ Position (different duplicate!)                        │
│  └── ❌ ConnectorConfig (duplicate)                            │
│                                                                 │
│  components/SwapView.tsx                                       │
│  └── ❌ QuoteResult (mixed from multiple schemas)              │
│                                                                 │
│  components/NetworkStatus.tsx                                  │
│  └── ❌ ChainStatus (duplicate)                                │
└─────────────────────────────────────────────────────────────────┘

❌ Issues:
- 9 duplicate type definitions
- Types can drift from backend schemas
- No compile-time validation of API responses
- Manual maintenance burden
```

### Target Architecture (AFTER)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Gateway Backend                          │
│                    /Users/feng/gateway/src/                      │
├─────────────────────────────────────────────────────────────────┤
│  schemas/                                                        │
│  ├── chain-schema.ts      ◄──┐                                 │
│  ├── clmm-schema.ts       ◄──┤                                 │
│  ├── amm-schema.ts        ◄──┤ Direct TypeScript imports       │
│  └── router-schema.ts     ◄──┤ via @gateway/* alias           │
└───────────────────────────────┼─────────────────────────────────┘
                               │
                               │ Type imports + HTTP API
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Gateway App Frontend                        │
│              /Users/feng/gateway/gateway-app/src/               │
├─────────────────────────────────────────────────────────────────┤
│  lib/gateway-types.ts (NEW)                                     │
│  ├── ✅ Re-export all Gateway types                            │
│  ├── ✅ TokenInfo = TokensResponseType['tokens'][number]       │
│  ├── ✅ PositionWithConnector extends PositionInfo            │
│  └── ✅ ConnectorConfig (shared definition)                    │
│                                                                 │
│  components/PortfolioView.tsx                                  │
│  ├── ✅ import { Balance } from '@/lib/gateway-types'          │
│  ├── ✅ import { PositionWithConnector } from '@/lib/...'      │
│  └── ✅ import { ConnectorConfig } from '@/lib/...'            │
│                                                                 │
│  components/PoolsView.tsx                                      │
│  ├── ✅ import { CLMMPoolInfo } from '@/lib/gateway-types'     │
│  ├── ✅ import { PositionInfo } from '@/lib/gateway-types'     │
│  └── ✅ import { ConnectorConfig } from '@/lib/...'            │
│                                                                 │
│  components/SwapView.tsx                                       │
│  └── ✅ import { RouterQuoteResponse } from '@/lib/...'        │
│                                                                 │
│  components/NetworkStatus.tsx                                  │
│  └── ✅ import { StatusResponseType } from '@/lib/...'         │
└─────────────────────────────────────────────────────────────────┘

✅ Benefits:
- Single source of truth (Gateway schemas)
- Types never drift from backend
- Compile-time validation of API responses
- Automatic updates when Gateway schemas change
```

---

## Type Mapping Matrix

| Frontend Type | Current Location | Gateway Schema | Import Path | Status |
|---------------|------------------|----------------|-------------|--------|
| `TokenInfo` | utils.ts:9-14 | `TokensResponseType['tokens'][number]` | `@gateway/schemas/chain-schema` | 🔄 Pending |
| `Position` (Portfolio) | PortfolioView.tsx:20-37 | `PositionInfo` | `@gateway/schemas/clmm-schema` | 🔄 Pending |
| `Position` (Pools) | PoolsView.tsx:37-46 | Various (needs analysis) | TBD | 🔄 Pending |
| `PoolInfo` | PoolsView.tsx:22-36 | `PoolInfo` (CLMM/AMM union) | `@gateway/schemas/clmm-schema` + `amm-schema` | 🔄 Pending |
| `Pool` | PoolsView.tsx:10-20 | Custom (template structure) | Stay custom | 🔄 Pending |
| `QuoteResult` | SwapView.tsx:11-23 | `QuoteSwapResponseType` | `@gateway/schemas/router-schema` | 🔄 Pending |
| `ChainStatus` | NetworkStatus.tsx:4-12 | `StatusResponseType` | `@gateway/schemas/chain-schema` | 🔄 Pending |
| `ConnectorConfig` | Multiple files | Config API response | Create in gateway-types.ts | 🔄 Pending |
| `Balance` | PortfolioView.tsx:11-17 | Custom UI type | Stay custom | 🔄 Pending |

---

## Implementation Plan

### Step 1: Create Gateway Types Module ✓ Ready

**File**: `src/lib/gateway-types.ts`

**Purpose**: Central module that re-exports Gateway schemas and defines UI-specific extensions.

**Tasks**:
- [ ] Create file with all necessary imports
- [ ] Re-export common Gateway types
- [ ] Define UI-specific type extensions
- [ ] Add JSDoc comments for documentation
- [ ] Export convenience types (TokenInfo, etc.)

**Dependencies**: None
**Risk**: Low
**Time**: 15 minutes

---

### Step 2: Replace TokenInfo in utils.ts ✓ Ready

**File**: `src/lib/utils.ts`

**Current**:
```typescript
export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}
```

**New**:
```typescript
import type { TokensResponseType } from '@gateway/schemas/chain-schema';

// Extract token type from Gateway response
export type TokenInfo = TokensResponseType['tokens'][number];
```

**Tasks**:
- [ ] Add import from Gateway schema
- [ ] Replace interface with type alias
- [ ] Verify getSelectableTokenList() still works
- [ ] Run TypeScript check

**Files affected**: 1 (utils.ts)
**Risk**: Low (type structure identical)
**Time**: 5 minutes

---

### Step 3: Replace ChainStatus in NetworkStatus.tsx ✓ Ready

**File**: `src/components/NetworkStatus.tsx`

**Current**:
```typescript
interface ChainStatus {
  chain: string;
  network: string;
  rpcUrl: string;
  connection: boolean;
  timestamp: number;
}
```

**New**:
```typescript
import type { StatusResponseType as ChainStatus } from '@/lib/gateway-types';
```

**Tasks**:
- [ ] Replace interface with import
- [ ] Verify component rendering
- [ ] Check for any missing/extra fields
- [ ] Run TypeScript check

**Files affected**: 1 (NetworkStatus.tsx)
**Risk**: Low
**Time**: 5 minutes

---

### Step 4: Replace Position in PortfolioView.tsx ⚠️ Requires Analysis

**File**: `src/components/PortfolioView.tsx`

**Current**:
```typescript
interface Position {
  address: string;
  poolAddress: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseFeeAmount: number;
  quoteFeeAmount: number;
  lowerBinId: number;
  upperBinId: number;
  lowerPrice: number;
  upperPrice: number;
  price: number;
  rewardTokenAddress?: string;
  rewardAmount?: number;
  connector: string;  // UI-specific field
}
```

**Analysis Needed**:
1. Check Gateway's `PositionInfo` schema structure
2. Verify all fields match (except `connector`)
3. Determine if extension is needed

**New (proposed)**:
```typescript
import type { PositionWithConnector } from '@/lib/gateway-types';

// In gateway-types.ts:
export interface PositionWithConnector extends PositionInfo {
  connector: string;
}
```

**Tasks**:
- [ ] Verify PositionInfo fields match current interface
- [ ] Add PositionWithConnector to gateway-types.ts
- [ ] Replace interface with import
- [ ] Update fetchPositions() to add connector field
- [ ] Run TypeScript check
- [ ] Test positions display

**Files affected**: 2 (PortfolioView.tsx, gateway-types.ts)
**Risk**: Medium (needs field verification)
**Time**: 15 minutes

---

### Step 5: Replace PoolInfo in PoolsView.tsx ⚠️ Complex

**File**: `src/components/PoolsView.tsx`

**Current**:
```typescript
interface PoolInfo {
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  activeBinId?: number;      // CLMM (Meteora)
  binStep?: number;          // CLMM (Meteora)
  sqrtPriceX64?: string;     // CLMM (Uniswap)
  tick?: number;             // CLMM (Uniswap)
  liquidity?: string;        // CLMM (Uniswap)
}
```

**Analysis**: This is a union of CLMM and AMM pool info types.

**Gateway Schemas**:
- `clmm-schema.ts`: `PoolInfo` (base CLMM)
- `clmm-schema.ts`: `MeteoraPoolInfo` (Meteora-specific)
- `amm-schema.ts`: `PoolInfo` (AMM pools)

**New (proposed)**:
```typescript
import type {
  PoolInfo as CLMMPoolInfo,
  MeteoraPoolInfo
} from '@/lib/gateway-types';

// Use discriminated union
type PoolInfo = CLMMPoolInfo | MeteoraPoolInfo;
```

**Tasks**:
- [ ] Read Gateway CLMM schema to understand structure
- [ ] Read Gateway AMM schema
- [ ] Determine which fields are common vs specific
- [ ] Create appropriate union type
- [ ] Update component to handle union
- [ ] Run TypeScript check
- [ ] Test pool info display

**Files affected**: 2 (PoolsView.tsx, gateway-types.ts)
**Risk**: High (complex union type)
**Time**: 30 minutes

---

### Step 6: Replace Pool template type ✓ Keep Custom

**File**: `src/components/PoolsView.tsx`

**Current**:
```typescript
interface Pool {
  type: string;
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  connector?: string;
}
```

**Decision**: Keep this custom type as it represents the pool template structure, not the API response.

**Tasks**:
- [ ] Add comment explaining this is template structure
- [ ] Keep as-is
- [ ] Document in gateway-types.ts for reference

**Files affected**: 1 (add comment)
**Risk**: None
**Time**: 2 minutes

---

### Step 7: Replace QuoteResult in SwapView.tsx ⚠️ Complex

**File**: `src/components/SwapView.tsx`

**Current**:
```typescript
interface QuoteResult {
  expectedAmount: string;
  priceImpact?: number;
  route?: string[];
  amountIn?: number;
  amountOut?: number;
  minAmountOut?: number;
  maxAmountIn?: number;
  price?: number;
  slippageBps?: number;
  routePlan?: any[];
  quoteId?: string;
}
```

**Analysis**: This mixes fields from Router and CLMM quote responses.

**Gateway Schemas**:
- `router-schema.ts`: `QuoteSwapResponseType` (Jupiter, 0x)
- `clmm-schema.ts`: `QuoteSwapResponseType` (CLMM pools)

**New (proposed)**:
```typescript
import type {
  RouterQuoteResponse,
  CLMMQuoteResponse
} from '@/lib/gateway-types';

// Use discriminated union based on connector type
type QuoteResult = RouterQuoteResponse | CLMMQuoteResponse;
```

**Tasks**:
- [ ] Read Gateway router schema
- [ ] Read Gateway CLMM schema
- [ ] Map current fields to schema fields
- [ ] Create union type in gateway-types.ts
- [ ] Update component to handle both types
- [ ] Test quote display with Jupiter
- [ ] Test quote display with CLMM connector

**Files affected**: 2 (SwapView.tsx, gateway-types.ts)
**Risk**: High (affects core swap functionality)
**Time**: 30 minutes

---

### Step 8: Add ConnectorConfig shared type ✓ Ready

**Current**: Duplicated in PortfolioView.tsx and PoolsView.tsx

**New**: Add to gateway-types.ts as shared type

```typescript
// In gateway-types.ts
export interface ConnectorConfig {
  name: string;
  trading_types: string[];
  chain: string;
  networks: string[];
}
```

**Tasks**:
- [ ] Add to gateway-types.ts
- [ ] Replace in PortfolioView.tsx
- [ ] Replace in PoolsView.tsx
- [ ] Run TypeScript check

**Files affected**: 3 (gateway-types.ts, PortfolioView.tsx, PoolsView.tsx)
**Risk**: Low
**Time**: 10 minutes

---

### Step 9: Update Balance type ✓ Keep Custom

**File**: `src/components/PortfolioView.tsx`

**Current**:
```typescript
interface Balance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  value?: number;
}
```

**Decision**: Keep as custom UI type. It combines TokenInfo with balance data.

**Optional Enhancement**:
```typescript
interface Balance extends TokenInfo {
  balance: string;
  value?: number;
}
```

**Tasks**:
- [ ] Consider if enhancement makes sense
- [ ] Add comment explaining purpose
- [ ] Keep as-is or extend TokenInfo

**Files affected**: 1
**Risk**: Low
**Time**: 5 minutes

---

## Testing Strategy

### After Each Step

1. **TypeScript Check**:
   ```bash
   cd /Users/feng/gateway/gateway-app
   pnpm build
   ```

2. **Visual Inspection**:
   - Run app in dev mode
   - Navigate to affected component
   - Verify data displays correctly
   - Check browser console for errors

3. **Git Checkpoint**:
   ```bash
   git add .
   git commit -m "refactor: replace [TypeName] with Gateway schema import"
   ```

### Final Verification

1. **Full Build Test**:
   ```bash
   pnpm build
   ```

2. **Runtime Test**:
   - Test all views (Portfolio, Swap, Liquidity, Config)
   - Test all interactions (add token, swap, view positions)
   - Verify API calls work correctly
   - Check type safety in IDE (hover over variables)

3. **Type Coverage Check**:
   ```bash
   # Count remaining 'interface' declarations in components
   grep -r "interface.*{" src/components/ | wc -l
   # Should decrease significantly
   ```

---

## Risk Assessment

### Low Risk (Safe to proceed)
- ✅ TokenInfo replacement
- ✅ ChainStatus replacement
- ✅ ConnectorConfig addition
- ✅ Balance enhancement

### Medium Risk (Requires testing)
- ⚠️ Position replacement (verify fields match)
- ⚠️ Pool type (keep custom with docs)

### High Risk (Requires careful analysis)
- 🔴 PoolInfo replacement (union of CLMM/AMM types)
- 🔴 QuoteResult replacement (affects swap functionality)

**Mitigation**:
- Start with low-risk items
- Test thoroughly after each change
- Keep git commits small and atomic
- Document any mismatches discovered

---

## Success Criteria

- [ ] All duplicate types replaced with Gateway imports
- [ ] Zero TypeScript errors after build
- [ ] All components render correctly
- [ ] API calls work with proper types
- [ ] IDE autocomplete works for Gateway types
- [ ] Code is more maintainable
- [ ] Types stay in sync with backend automatically

---

## Rollback Plan

If issues arise:

1. **Single file issue**:
   ```bash
   git checkout HEAD -- src/components/ProblemComponent.tsx
   ```

2. **Multiple issues**:
   ```bash
   git reset --hard HEAD~5  # Reset last 5 commits
   git push --force-with-lease origin feat/gateway-app
   ```

3. **Critical blocker**:
   - Create new branch `feat/gateway-app-phase1-revert`
   - Cherry-pick working commits
   - Continue from stable state

---

## Next Steps After Phase 1

Once Phase 1 is complete:
- ✅ Types are synced with Gateway
- ➡️ Proceed to Phase 2: Extract utility functions
- ➡️ Code reduction will accelerate in Phases 2-3

---

## Questions & Decisions Log

### Q1: Should we keep custom UI types?
**A**: Yes, keep types that add UI-specific fields (like `connector` on Position) or combine multiple concepts (like Balance = TokenInfo + balance).

### Q2: How to handle union types from multiple schemas?
**A**: Create discriminated unions in gateway-types.ts with clear naming (RouterQuoteResponse vs CLMMQuoteResponse).

### Q3: What if Gateway schema fields don't match our usage?
**A**: Document mismatches, extend types when needed, but prefer adapting UI to match Gateway schema.

### Q4: Should we use TypeBox Static types directly?
**A**: Yes, import the Static-extracted types (e.g., `TokensResponseType`) not the TypeBox schemas themselves.

---

**Ready to begin implementation**: Step 1 (Create gateway-types.ts)

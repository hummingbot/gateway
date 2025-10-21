# CLMM Open Position Cleanup Plan

## Executive Summary

Clean up CLMM `open-position` implementations to remove legacy pool lookup code and align with the existing schema requirement that `poolAddress` is mandatory. This is a **non-breaking change** since the schema already requires `poolAddress`.

## Current State

### Schema Status (Already Correct) ✅

**Global CLMM Schema** (`src/schemas/clmm-schema.ts`):
```typescript
export const OpenPositionRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.Optional(Type.String()),
  lowerPrice: Type.Number(),
  upperPrice: Type.Number(),
  poolAddress: Type.String(),  // ✅ REQUIRED
  baseTokenAmount: Type.Optional(Type.Number()),
  quoteTokenAmount: Type.Optional(Type.Number()),
  slippagePct: Type.Optional(Type.Number()),
});
```

**Connector Schemas** (All Correct):
- ✅ Raydium: `poolAddress: Type.String()` - Required
- ✅ Uniswap: `poolAddress: Type.String()` - Required
- ✅ Meteora: Uses global schema - Required
- ✅ PancakeSwap: Uses global schema - Required

### Implementation Issues (Need Cleanup) ❌

All connectors correctly require `poolAddress`, but some have legacy code:

#### 1. Raydium CLMM - Unused Parameters and Dead Code
**File**: `src/connectors/raydium/clmm-routes/openPosition.ts`

**Problems**:
- Lines 25-26: Unused `baseTokenSymbol?` and `quoteTokenSymbol?` parameters
- Lines 35-46: Commented-out pool lookup logic (dead code)
- Lines 202-203: Passes `undefined` for removed parameters

#### 2. Uniswap CLMM - Misleading Schema Examples
**File**: `src/connectors/uniswap/clmm-routes/openPosition.ts`

**Problem**:
- Lines 55-56: Schema examples show `baseToken` and `quoteToken` that don't exist in actual schema

#### 3. Meteora CLMM - Clean ✅
**File**: `src/connectors/meteora/clmm-routes/openPosition.ts`
- No issues, implementation is clean

#### 4. PancakeSwap CLMM - Clean ✅
**File**: `src/connectors/pancakeswap/clmm-routes/openPosition.ts`
- No issues, implementation is clean

### Swap Operations - OUT OF SCOPE

**Decision**: Leave swap operations unchanged. They can continue to support pool lookup from token pairs.

**Rationale**:
- Swaps are different from liquidity operations
- Pool lookup for swaps is a convenience feature
- No consistency issue - swaps don't require explicit pool selection
- Router-style swaps often don't specify pools

## Problems to Fix

### Problem 1: Raydium Has Legacy Pool Lookup Code

**File**: `src/connectors/raydium/clmm-routes/openPosition.ts`

**Issue**: Function signature has unused parameters from old design where pool could be looked up from token symbols.

**Current code** (lines 16-28):
```typescript
async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  baseTokenSymbol?: string,        // ❌ UNUSED - should be removed
  quoteTokenSymbol?: string,       // ❌ UNUSED - should be removed
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
```

**Dead code** (lines 35-46):
```typescript
  // If no pool address provided, find default pool using base and quote tokens
  let poolAddressToUse = poolAddress;
  if (!poolAddressToUse) {
    if (!baseTokenSymbol || !quoteTokenSymbol) {
      throw new Error('Either poolAddress or both baseToken and quoteToken must be provided');
    }

    poolAddressToUse = await raydium.findDefaultPool(baseTokenSymbol, quoteTokenSymbol, 'clmm');
    if (!poolAddressToUse) {
      throw new Error(`No CLMM pool found for pair ${baseTokenSymbol}-${quoteTokenSymbol}`);
    }
  }
```

**Route handler** (lines 193-205):
```typescript
return await openPosition(
  fastify,
  networkToUse,
  walletAddress,
  lowerPrice,
  upperPrice,
  poolAddress,
  baseTokenAmount,
  quoteTokenAmount,
  undefined, // baseToken not needed anymore    // ❌ Passes undefined
  undefined, // quoteToken not needed anymore   // ❌ Passes undefined
  slippagePct,
);
```

### Problem 2: Uniswap Has Misleading Documentation

**File**: `src/connectors/uniswap/clmm-routes/openPosition.ts`

**Issue**: Schema documentation shows fields that don't exist in the actual schema.

**Current code** (lines 46-60):
```typescript
schema: {
  description: 'Open a new liquidity position in a Uniswap V3 pool',
  tags: ['/connector/uniswap'],
  body: {
    ...OpenPositionRequest,
    properties: {
      ...OpenPositionRequest.properties,
      network: { type: 'string', default: 'base' },
      walletAddress: { type: 'string', examples: [walletAddressExample] },
      lowerPrice: { type: 'number', examples: [1000] },
      upperPrice: { type: 'number', examples: [4000] },
      poolAddress: { type: 'string', examples: [''] },
      baseToken: { type: 'string', examples: ['WETH'] },      // ❌ NOT in schema
      quoteToken: { type: 'string', examples: ['USDC'] },    // ❌ NOT in schema
      baseTokenAmount: { type: 'number', examples: [0.001] },
      quoteTokenAmount: { type: 'number', examples: [3] },
      slippagePct: { type: 'number', examples: [1] },
    },
  },
```

**Note**: `baseToken` and `quoteToken` are NOT fields in `OpenPositionRequest` - these are just misleading examples that could confuse API users.

## Proposed Changes

### Change 1: Clean Up Raydium Open Position

**File**: `src/connectors/raydium/clmm-routes/openPosition.ts`

#### 1.1 Update Function Signature (lines 16-28)

**Before**:
```typescript
async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  baseTokenSymbol?: string,
  quoteTokenSymbol?: string,
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
```

**After**:
```typescript
async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
```

#### 1.2 Remove Dead Code (lines 35-46)

**Delete entire block**:
```typescript
  // If no pool address provided, find default pool using base and quote tokens
  let poolAddressToUse = poolAddress;
  if (!poolAddressToUse) {
    if (!baseTokenSymbol || !quoteTokenSymbol) {
      throw new Error('Either poolAddress or both baseToken and quoteToken must be provided');
    }

    poolAddressToUse = await raydium.findDefaultPool(baseTokenSymbol, quoteTokenSymbol, 'clmm');
    if (!poolAddressToUse) {
      throw new Error(`No CLMM pool found for pair ${baseTokenSymbol}-${quoteTokenSymbol}`);
    }
  }
```

**Replace with**:
```typescript
  // Use poolAddress directly - required by schema
  const poolAddressToUse = poolAddress;
```

Or simply remove the variable and use `poolAddress` directly throughout (line 48 onwards).

#### 1.3 Update Route Handler Call (lines 193-205)

**Before**:
```typescript
return await openPosition(
  fastify,
  networkToUse,
  walletAddress,
  lowerPrice,
  upperPrice,
  poolAddress,
  baseTokenAmount,
  quoteTokenAmount,
  undefined, // baseToken not needed anymore
  undefined, // quoteToken not needed anymore
  slippagePct,
);
```

**After**:
```typescript
return await openPosition(
  fastify,
  networkToUse,
  walletAddress,
  lowerPrice,
  upperPrice,
  poolAddress,
  baseTokenAmount,
  quoteTokenAmount,
  slippagePct,
);
```

### Change 2: Fix Uniswap Schema Examples

**File**: `src/connectors/uniswap/clmm-routes/openPosition.ts`

#### 2.1 Remove Misleading Examples (lines 55-56)

**Before**:
```typescript
body: {
  ...OpenPositionRequest,
  properties: {
    ...OpenPositionRequest.properties,
    network: { type: 'string', default: 'base' },
    walletAddress: { type: 'string', examples: [walletAddressExample] },
    lowerPrice: { type: 'number', examples: [1000] },
    upperPrice: { type: 'number', examples: [4000] },
    poolAddress: { type: 'string', examples: [''] },
    baseToken: { type: 'string', examples: ['WETH'] },      // ❌ REMOVE
    quoteToken: { type: 'string', examples: ['USDC'] },    // ❌ REMOVE
    baseTokenAmount: { type: 'number', examples: [0.001] },
    quoteTokenAmount: { type: 'number', examples: [3] },
    slippagePct: { type: 'number', examples: [1] },
  },
},
```

**After**:
```typescript
body: {
  ...OpenPositionRequest,
  properties: {
    ...OpenPositionRequest.properties,
    network: { type: 'string', default: 'base' },
    walletAddress: { type: 'string', examples: [walletAddressExample] },
    lowerPrice: { type: 'number', examples: [1000] },
    upperPrice: { type: 'number', examples: [4000] },
    poolAddress: { type: 'string', examples: ['0xd0b53d9277642d899df5c87a3966a349a798f224'] },
    baseTokenAmount: { type: 'number', examples: [0.001] },
    quoteTokenAmount: { type: 'number', examples: [3] },
    slippagePct: { type: 'number', examples: [1] },
  },
},
```

**Note**: Also update poolAddress example to show actual pool address instead of empty string.

## Impact Analysis

### Breaking Changes

✅ **NO BREAKING CHANGES**

The schema already requires `poolAddress`, so this is purely an internal cleanup:
- API contracts unchanged
- All existing valid requests continue to work
- Invalid requests (missing poolAddress) already fail at schema validation

### Files Changed

**Total**: 2 files
1. `src/connectors/raydium/clmm-routes/openPosition.ts` - Remove unused code
2. `src/connectors/uniswap/clmm-routes/openPosition.ts` - Fix examples

### Tests to Update

**Raydium CLMM Tests**:
- No test changes needed (tests already provide poolAddress)
- Verify tests still pass after cleanup

**Uniswap CLMM Tests**:
- No test changes needed
- Verify tests still pass after cleanup

## Benefits

1. **Cleaner codebase**: Removes ~15 lines of dead code
2. **Less confusion**: No misleading examples in Swagger UI
3. **Consistent**: Implementation matches schema exactly
4. **Maintainable**: Fewer code paths to maintain
5. **Clear intent**: poolAddress is always required, no ambiguity

## Risks & Mitigation

### Risk 1: Breaking hidden dependencies
**Likelihood**: Very low
**Mitigation**:
- Schema already enforces poolAddress requirement
- Any code relying on token lookup would already be failing
- Run full test suite to verify

### Risk 2: Future pool lookup feature request
**Likelihood**: Low
**Mitigation**:
- Users can use `fetch-pools` endpoint
- Swap operations still support token lookup
- Document the recommended flow in examples

## Testing Strategy

### Unit Tests

**Raydium CLMM**:
```bash
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/raydium/clmm-routes/openPosition.test.ts
```

**Uniswap CLMM**:
```bash
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/uniswap/clmm-routes/openPosition.test.ts
```

### Manual Testing

1. **Raydium open-position** - Verify normal operation:
```bash
curl -X POST http://localhost:15888/connectors/raydium/clmm/open-position \
  -H "Content-Type: application/json" \
  -d '{
    "network": "mainnet-beta",
    "walletAddress": "...",
    "poolAddress": "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
    "lowerPrice": 100,
    "upperPrice": 200,
    "baseTokenAmount": 0.01,
    "slippagePct": 1
  }'
```

2. **Uniswap open-position** - Verify Swagger examples:
- Open http://localhost:15888/docs
- Navigate to `/connectors/uniswap/clmm/open-position`
- Verify examples don't show baseToken/quoteToken
- Verify poolAddress example shows real address

### Regression Testing

Run full connector test suites:
```bash
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/raydium/
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/uniswap/
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/meteora/
GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/pancakeswap/
```

## Implementation Checklist

### Pre-Implementation
- [ ] Review plan with team
- [ ] Confirm no objections to removing dead code
- [ ] Verify test coverage exists

### Implementation
- [ ] Update Raydium openPosition.ts function signature
- [ ] Remove Raydium dead code (lines 35-46)
- [ ] Update Raydium route handler call
- [ ] Remove Uniswap schema examples for baseToken/quoteToken
- [ ] Update Uniswap poolAddress example to real address
- [ ] Run Raydium CLMM tests
- [ ] Run Uniswap CLMM tests
- [ ] Manual testing via Swagger UI
- [ ] Manual testing via curl

### Documentation
- [ ] Update code comments if needed
- [ ] Verify Swagger UI shows correct schema
- [ ] Check that poolAddress is marked as required in docs

### Commit
- [ ] Create descriptive commit message
- [ ] Push changes
- [ ] Verify CI/CD passes

## User-Facing Changes

### Swagger UI

**Before** (Uniswap):
```json
{
  "poolAddress": "",
  "baseToken": "WETH",     // ❌ Shown but not in schema
  "quoteToken": "USDC",    // ❌ Shown but not in schema
  "lowerPrice": 1000,
  ...
}
```

**After** (Uniswap):
```json
{
  "poolAddress": "0xd0b53d9277642d899df5c87a3966a349a798f224",
  "lowerPrice": 1000,
  ...
}
```

### API Behavior

**No change** - API behavior is identical before and after:
- poolAddress always required
- Requests without poolAddress fail at schema validation
- Requests with poolAddress work as before

## Timeline Estimate

- **Implementation**: 30 minutes
  - Raydium changes: 15 minutes
  - Uniswap changes: 15 minutes
- **Testing**: 30 minutes
  - Unit tests: 15 minutes
  - Manual testing: 15 minutes
- **Documentation**: 15 minutes
  - Verify Swagger
  - Update comments

**Total**: ~1.5 hours

## Success Criteria

✅ Implementation is successful when:
1. Raydium openPosition has no unused parameters
2. Raydium openPosition has no commented-out code
3. Uniswap schema examples don't show non-existent fields
4. All existing tests pass
5. Swagger UI shows correct schema
6. Manual testing confirms functionality unchanged

## Related Work

### Future Enhancements (Out of Scope)

These are NOT part of this cleanup but could be considered separately:

1. **Add pool validation**: Verify poolAddress exists before attempting operation
2. **Enhanced error messages**: Better errors when poolAddress is invalid
3. **Pool metadata in response**: Return pool info in successful responses
4. **Standardize other operations**: Review remove-liquidity, collect-fees, etc.

## Questions & Answers

**Q: Why not also clean up swap operations?**
A: Swap operations intentionally support pool lookup from token pairs as a convenience feature. This is different from liquidity operations which require explicit pool selection.

**Q: Should we remove `Raydium.findDefaultPool()` method?**
A: Out of scope for this cleanup. It may still be used by swap operations. Can be addressed in future cleanup if truly unused.

**Q: Will this affect Hummingbot integration?**
A: No - Hummingbot already provides poolAddress when calling open-position endpoints.

**Q: Do we need a migration guide?**
A: No - this is not a breaking change. The schema already requires poolAddress.

---

**Document Version**: 2.0
**Created**: 2025-10-15
**Author**: Claude Code
**Status**: Ready for Implementation
**Breaking Changes**: None
**Estimated Effort**: 1.5 hours

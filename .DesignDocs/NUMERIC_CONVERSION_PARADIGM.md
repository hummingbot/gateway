# Numeric Conversion Paradigm for PancakeSwap CLMM

## Problem

JavaScript and TypeScript have issues with large numbers and floating-point precision:
- Scientific notation (e.g., `1e+18`) breaks BigNumber conversions
- Floating-point decimals (e.g., `0.2`, `1.1`) can't be directly converted to wei
- Undefined or null values passed to `BigNumber.from()` cause crashes

## Solution: Defensive Conversion Paradigm

### 1. **Input Handling: Always use `utils.parseUnits()`**

When converting user-provided decimal amounts to raw blockchain amounts:

```typescript
// ✅ CORRECT - Use parseUnits to handle decimals
const rawAmount = utils.parseUnits(amount.toString(), tokenDecimals);

// ❌ WRONG - Direct multiplication creates scientific notation
const rawAmount = amount * Math.pow(10, tokenDecimals);
```

**Examples:**
- [openPosition.ts](c:\Users\alexp\trash\hummingbot-gateway\src\connectors\pancakeswap\clmm-routes\openPosition.ts#L107-L110)
- [addLiquidity.ts](c:\Users\alexp\trash\hummingbot-gateway\src\connectors\pancakeswap\clmm-routes\addLiquidity.ts#L64-L67)
- [quoteSwap.ts](c:\Users\alexp\trash\hummingbot-gateway\src\connectors\pancakeswap\clmm-routes\quoteSwap.ts#L52-L55)

### 2. **SDK Quotient Handling: Convert to string first**

When getting values from SDK Trade/Position objects:

```typescript
// ✅ CORRECT - Convert quotient to string, then to BigNumber
const rawValue = BigNumber.from(trade.inputAmount.quotient.toString()).toString();

// ❌ WRONG - Direct quotient access can cause issues
const rawValue = BigNumber.from(trade.inputAmount.quotient);
```

**Examples:**
- [quoteSwap.ts](c:\Users\alexp\trash\hummingbot-gateway\src\connectors\pancakeswap\clmm-routes\quoteSwap.ts#L91-L97)

### 3. **Validation: Check for undefined before conversion**

Always validate values before passing to BigNumber:

```typescript
// ✅ CORRECT - Validate first
if (!rawAmountInStr || !rawAmountOutStr) {
  throw new Error('Missing required values from trade');
}
const rawAmountIn = BigNumber.from(rawAmountInStr).toString();

// ❌ WRONG - No validation, undefined crashes
const rawAmountIn = BigNumber.from(someValue).toString();
```

**Examples:**
- [quoteSwap.ts](c:\Users\alexp\trash\hummingbot-gateway\src\connectors\pancakeswap\clmm-routes\quoteSwap.ts#L91-L97)

### 4. **Logging: Add defensive logging for debugging**

Log all critical values with their types:

```typescript
logger.info(`Quote values received:`);
logger.info(`  rawAmountIn: ${quote.rawAmountIn} (type: ${typeof quote.rawAmountIn})`);
logger.info(`  rawAmountOut: ${quote.rawAmountOut} (type: ${typeof quote.rawAmountOut})`);
```

**Examples:**
- [executeSwap.ts](c:\Users\alexp\trash\hummingbot-gateway\src\connectors\pancakeswap\clmm-routes\executeSwap.ts#L50-L56)

### 5. **Output Formatting: Use formatTokenAmount()**

When converting raw amounts back to human-readable decimals:

```typescript
// ✅ CORRECT - Use formatTokenAmount utility
const displayAmount = formatTokenAmount(rawAmount.toString(), tokenDecimals);

// ❌ WRONG - Manual division can lose precision
const displayAmount = rawAmount / Math.pow(10, tokenDecimals);
```

**Examples:**
- [quoteSwap.ts](c:\Users\alexp\trash\hummingbot-gateway\src\connectors\pancakeswap\clmm-routes\quoteSwap.ts#L84-L85)

## Checklist for New Endpoints

When creating new CLMM endpoints, ensure:

- [ ] User decimal inputs converted with `utils.parseUnits(amount.toString(), decimals)`
- [ ] SDK quotients converted with `.quotient.toString()` before `BigNumber.from()`
- [ ] All values validated as non-undefined before BigNumber conversion
- [ ] Critical values logged with type information for debugging
- [ ] Raw amounts converted back with `formatTokenAmount()` for output
- [ ] All contract parameters use string values, not numbers
- [ ] Deadline parameters included in all transaction structs

## Common Errors and Fixes

### Error: "invalid BigNumber value (argument="value", value=undefined)"
**Cause:** Passing undefined to `BigNumber.from()`
**Fix:** Add validation before conversion:
```typescript
if (!value) {
  throw new Error('Value is undefined');
}
const bn = BigNumber.from(value);
```

### Error: "Cannot convert X to a BigInt"
**Cause:** Scientific notation in numeric value (e.g., `1e+18`)
**Fix:** Use `utils.parseUnits()` instead of multiplication:
```typescript
// Instead of: amount * 10**18
// Use: utils.parseUnits(amount.toString(), 18)
```

### Error: Transaction reverts with no clear error
**Cause:** Missing required parameters (e.g., `deadline`)
**Fix:** Ensure all transaction params match ABI requirements:
```typescript
const params = {
  tokenIn: address,
  tokenOut: address,
  fee: number,
  recipient: address,
  deadline: timestamp,  // ← Don't forget this!
  amountIn: string,
  amountOutMinimum: string,
  sqrtPriceLimitX96: string,
};
```

## Files Following This Paradigm

✅ **Fully Compliant:**
- `src/connectors/pancakeswap/clmm-routes/executeSwap.ts`
- `src/connectors/pancakeswap/clmm-routes/quoteSwap.ts`
- `src/connectors/pancakeswap/clmm-routes/openPosition.ts`
- `src/connectors/pancakeswap/clmm-routes/addLiquidity.ts`
- `src/connectors/pancakeswap/clmm-routes/quotePosition.ts`

✅ **No Direct Conversions (Safe):**
- `src/connectors/pancakeswap/clmm-routes/removeLiquidity.ts`
- `src/connectors/pancakeswap/clmm-routes/closePosition.ts`
- `src/connectors/pancakeswap/clmm-routes/collectFees.ts`
- `src/connectors/pancakeswap/clmm-routes/positionInfo.ts`
- `src/connectors/pancakeswap/clmm-routes/positionsOwned.ts`

## Testing the Paradigm

Always test with these edge cases:
1. **Small decimals:** `amount: 0.2`, `amount: 0.000001`
2. **Large integers:** `amount: 1000000`
3. **High precision:** `amount: 1.123456789`
4. **Scientific notation inputs:** Should be handled by `.toString()`
5. **Undefined values:** Should be caught by validation

## References

- [Ethers.js parseUnits documentation](https://docs.ethers.io/v5/api/utils/display-logic/#utils-parseUnits)
- [BigNumber documentation](https://docs.ethers.io/v5/api/utils/bignumber/)
- [PancakeSwap V3 SDK Trade Types](https://github.com/pancakeswap/pancake-frontend/tree/develop/packages/swap-sdk)

# Raydium SDK v0.1.141-alpha Breaking Changes

## Summary

Successfully upgraded Raydium SDK from v0.1.58-alpha to v0.1.141-alpha. The upgrade required fixing several breaking changes in the SDK API.

## Breaking Changes Found and Fixed

### 1. DEVNET_PROGRAM_ID Property Names
**Changed in:** `src/connectors/raydium/raydium.utils.ts`

```typescript
// Old SDK
DEVNET_PROGRAM_ID.AmmV4
DEVNET_PROGRAM_ID.AmmStable  
DEVNET_PROGRAM_ID.CLMM

// New SDK
DEVNET_PROGRAM_ID.AMM_V4
DEVNET_PROGRAM_ID.AMM_STABLE
DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID
```

### 2. Percent.toDecimal() Method Removed
**Changed in:** `src/connectors/raydium/amm-routes/addLiquidity.ts`

```typescript
// Old SDK
const slippageDecimal = slippage.toDecimal();

// New SDK
const slippageDecimal = slippage.numerator.toNumber() / slippage.denominator.toNumber();
```

### 3. addLiquidity Parameters
**Changed in:** `src/connectors/raydium/amm-routes/addLiquidity.ts`

The new SDK requires an `otherAmountMin` parameter:

```typescript
// Calculate otherAmountMin based on slippage
const otherAmountMin = baseLimited
  ? new TokenAmount(
      toToken(poolInfo.mintB),
      new Decimal(amountInB.raw.toString())
        .mul(slippageMultiplier)
        .toFixed(0),
    )
  : new TokenAmount(
      toToken(poolInfo.mintA),
      new Decimal(amountInA.raw.toString())
        .mul(slippageMultiplier)
        .toFixed(0),
    );

const response = await raydium.raydiumSDK.liquidity.addLiquidity({
  // ... other params
  otherAmountMin, // NEW REQUIRED PARAMETER
  computeBudgetConfig, // NEW OPTIONAL PARAMETER
});
```

### 4. removeLiquidity Parameters
**Changed in:** `src/connectors/raydium/amm-routes/removeLiquidity.ts`

```typescript
// Old SDK
const response = await raydium.raydiumSDK.liquidity.removeLiquidity({
  poolInfo,
  poolKeys,
  lpTokenAmount: lpAmount, // OLD NAME
  // ... other params
});

// New SDK
const response = await raydium.raydiumSDK.liquidity.removeLiquidity({
  poolInfo,
  poolKeys,
  lpAmount: lpAmount, // NEW NAME
  baseAmountMin, // Now uses BN instead of TokenAmount
  quoteAmountMin, // Now uses BN instead of TokenAmount
  // ... other params
});
```

### 5. Token Constructor Changes
The Token class now requires PublicKey instances instead of strings:

```typescript
// Old SDK
new Token({
  chainId: 101,
  address: 'So11111111111111111111111111111111111111112',
  // ...
});

// New SDK
new Token({
  address: new PublicKey('So11111111111111111111111111111111111111112'),
  programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  // chainId removed
});
```

### 6. CurveCalculator.swap() Signature
```typescript
// Old SDK
CurveCalculator.swap(amountIn, baseReserve, quoteReserve, swapDirection)

// New SDK  
CurveCalculator.swap(amountIn, baseReserve, quoteReserve, tradeFeeRate)
// tradeFeeRate is in basis points (e.g., 25 = 0.25%)
```

## New Features

### Compute Budget Configuration
All swap and liquidity methods now support `computeBudgetConfig` for priority fees:

```typescript
const computeBudgetConfig = {
  microLamports: 100000, // Priority fee per compute unit
  units: 600000 // Total compute units
};
```

## Unrelated Issues Fixed

### 0x Connector Async/Await
Fixed async/await issues in the 0x connector that were causing compilation errors:

```typescript
// Changed getInstance to async
public static async getInstance(network: string): Promise<ZeroX> {
  if (!ZeroX.instances.has(network)) {
    const ethereum = await Ethereum.getInstance(network);
    const chainId = ethereum.chainId;
    ZeroX.instances.set(network, new ZeroX(network, chainId));
  }
  return ZeroX.instances.get(network)!;
}
```

## Testing

Created comprehensive test coverage in `test/connectors/raydium/sdk-breaking-changes.test.js` that documents all breaking changes and verifies the fixes.

All existing tests pass with the new SDK version.

## Future Considerations

The SDK now includes an execute pattern for transaction handling (see `executeTransaction` method in `raydium.ts`), which could be adopted more widely in future updates to simplify transaction management and error handling.
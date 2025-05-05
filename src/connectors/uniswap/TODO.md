# Uniswap Connector Refactoring TODO List

## AMM Routes (Uniswap V2)

- [x] Basic structure setup
- [x] Configuration updates for AMM and CLMM
- [x] Uniswap class refactoring
- [x] Utility functions
- [x] Route handlers for AMM operations
  - [x] poolInfo.ts
  - [x] quoteSwap.ts
  - [x] executeSwap.ts
  - [x] addLiquidity.ts
  - [x] removeLiquidity.ts
  - [x] positionInfo.ts
  - [x] quoteLiquidity.ts

## CLMM Routes (Uniswap V3)

- [x] Route handlers for CLMM operations
  - [x] poolInfo.ts
  - [x] quoteSwap.ts
  - [x] executeSwap.ts
  - [x] openPosition.ts
  - [x] closePosition.ts
  - [x] addLiquidity.ts
  - [x] removeLiquidity.ts
  - [x] collectFees.ts
  - [x] positionInfo.ts
  - [x] positionsOwned.ts
  - [x] quotePosition.ts

## Tests

- [ ] Update tests for AMM routes
- [ ] Create tests for CLMM routes
- [ ] Integration tests for both AMM and CLMM

## Documentation

- [x] Basic README with structure overview
- [ ] API documentation
- [ ] Configuration guide
- [ ] Usage examples

## Legacy Support

- [ ] Create a compatibility layer for the legacy interface
- [ ] Ensure backward compatibility for existing routes
- [ ] Deprecation warnings for legacy routes

## Deployment

- [ ] Update deployment scripts if needed
- [ ] Ensure proper error handling
- [ ] Performance testing

## Future Improvements

- [ ] Add support for more Uniswap V3 features
- [ ] Optimize gas estimates
- [ ] Add more pool discovery methods
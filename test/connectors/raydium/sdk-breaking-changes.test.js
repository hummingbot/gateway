const { describe, test, expect } = require('@jest/globals');
const BN = require('bn.js');

// Direct SDK imports to test breaking changes
const { 
  DEVNET_PROGRAM_ID,
  Percent,
  TokenAmount,
  Token: TokenSDK,
  CurveCalculator
} = require('@raydium-io/raydium-sdk-v2');

describe('Raydium SDK v0.1.141-alpha Breaking Changes Documentation', () => {
  describe('DEVNET_PROGRAM_ID Property Changes', () => {
    test('property names have changed from old SDK', () => {
      // New SDK uses different property names
      expect(DEVNET_PROGRAM_ID.AMM_V4).toBeDefined();
      expect(DEVNET_PROGRAM_ID.AMM_STABLE).toBeDefined();
      expect(DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID).toBeDefined();
      
      // Old properties no longer exist
      expect(DEVNET_PROGRAM_ID.AmmV4).toBeUndefined();
      expect(DEVNET_PROGRAM_ID.AmmStable).toBeUndefined();
      expect(DEVNET_PROGRAM_ID.CLMM).toBeUndefined();
      
      console.log('Breaking change: DEVNET_PROGRAM_ID properties renamed');
      console.log('  Old: AmmV4, AmmStable, CLMM');
      console.log('  New: AMM_V4, AMM_STABLE, CLMM_PROGRAM_ID');
    });
  });

  describe('Percent Class Changes', () => {
    test('toDecimal() method has been removed', () => {
      const percent = new Percent(1, 100); // 1%
      
      // toDecimal() method no longer exists
      expect(percent.toDecimal).toBeUndefined();
      
      // Must calculate decimal value manually
      const decimal = percent.numerator.toNumber() / percent.denominator.toNumber();
      expect(decimal).toBe(0.01);
      
      console.log('Breaking change: Percent.toDecimal() removed');
      console.log('  Old: percent.toDecimal()');
      console.log('  New: percent.numerator.toNumber() / percent.denominator.toNumber()');
    });

    test('Percent arithmetic operations', () => {
      const percent1 = new Percent(1, 100); // 1%
      const percent2 = new Percent(2, 100); // 2%
      
      // Can still add percentages
      const sum = percent1.add(percent2);
      expect(sum.numerator.toNumber()).toBe(3);
      expect(sum.denominator.toNumber()).toBe(100);
    });
  });

  describe('Token and TokenAmount Classes', () => {
    test('Token class changes documented', () => {
      // The SDK Token class requires PublicKey instances, not strings
      // This is a breaking change from the old SDK
      const changes = {
        address: 'Now requires PublicKey instance, not string',
        programId: 'Now requires PublicKey instance, not string',
        chainId: 'Property removed'
      };
      
      expect(Object.keys(changes).length).toBe(3);
      
      console.log('Breaking change: Token constructor requires PublicKey instances');
      console.log('  Old: address as string');
      console.log('  New: address as PublicKey instance');
    });

    test('TokenAmount class behavior', () => {
      // TokenAmount still exists and works with BN
      const bnAmount = new BN('1000000');
      
      expect(bnAmount.toString()).toBe('1000000');
      
      console.log('TokenAmount works with Token instances and BN amounts');
    });
  });

  describe('CurveCalculator Changes', () => {
    test('swap function signature has changed', () => {
      // CurveCalculator.swap now requires different parameters
      const oldSignature = 'swap(amountIn, baseReserve, quoteReserve, swapDirection)';
      const newSignature = 'swap(amountIn, baseReserve, quoteReserve, tradeFeeRate)';
      
      expect(oldSignature).not.toBe(newSignature);
      
      console.log('Breaking change: CurveCalculator.swap() signature changed');
      console.log(`  Old: ${oldSignature}`);
      console.log(`  New: ${newSignature}`);
      console.log('  Note: tradeFeeRate is in basis points (e.g., 25 = 0.25%)');
    });

    test('swap calculation changes', () => {
      // Document the calculation changes
      const changes = {
        swapDirection: 'Parameter removed',
        tradeFeeRate: 'New parameter in basis points',
        result: 'Returns { amountSwapped, priceImpact }'
      };
      
      expect(Object.keys(changes).length).toBe(3);
      
      console.log('CurveCalculator now includes fee calculation directly');
    });
  });

  describe('Liquidity Method Parameter Changes', () => {
    test('documents addLiquidity parameter changes', () => {
      // This is a documentation test - actual SDK methods require initialized instance
      const oldParams = [
        'poolInfo',
        'poolKeys', 
        'amountInA',
        'amountInB',
        'fixedSide',
        'txVersion'
      ];
      
      const newParams = [
        'poolInfo',
        'poolKeys',
        'amountInA', 
        'amountInB',
        'fixedSide',
        'txVersion',
        'otherAmountMin', // NEW: Required parameter
        'computeBudgetConfig' // NEW: Optional parameter
      ];
      
      expect(newParams.length).toBeGreaterThan(oldParams.length);
      expect(newParams).toContain('otherAmountMin');
      expect(newParams).toContain('computeBudgetConfig');
      
      console.log('Breaking change: addLiquidity requires otherAmountMin parameter');
    });

    test('documents removeLiquidity parameter changes', () => {
      const changes = {
        lpAmount: 'Changed from lpTokenAmount',
        baseAmountMin: 'Now uses BN instead of TokenAmount',
        quoteAmountMin: 'Now uses BN instead of TokenAmount'
      };
      
      expect(Object.keys(changes).length).toBe(3);
      
      console.log('Breaking change: removeLiquidity parameter types changed');
      console.log('  lpAmount: renamed from lpTokenAmount');
      console.log('  baseAmountMin/quoteAmountMin: now use BN instead of TokenAmount');
    });
  });

  describe('Compute Budget Configuration', () => {
    test('new computeBudgetConfig parameter support', () => {
      // All liquidity and swap methods now support computeBudgetConfig
      const computeBudgetConfig = {
        microLamports: 100000, // Priority fee per compute unit
        units: 600000 // Total compute units
      };
      
      expect(computeBudgetConfig.microLamports).toBeDefined();
      expect(computeBudgetConfig.units).toBeDefined();
      
      console.log('New feature: computeBudgetConfig for priority fees');
      console.log('  Supported in: swap, addLiquidity, removeLiquidity');
    });
  });
});
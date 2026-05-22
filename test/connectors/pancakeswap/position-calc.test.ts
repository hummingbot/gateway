/**
 * Regression tests for BigInt / scientific notation conversion bugs in the
 * PancakeSwap CLMM connector.
 *
 * Bug: Math.floor(amount * Math.pow(10, decimals)).toString() produces scientific
 * notation strings (e.g. "1.5e+21") for large amounts, causing JSBI.BigInt(),
 * BigNumber.from(), and CurrencyAmount.fromRawAmount() to throw:
 *   "Cannot convert 1.5e+21 to a BigInt"
 *
 * Fix: use ethers utils.parseUnits() which returns a proper integer string.
 */

import { BigNumber, utils } from 'ethers';
import JSBI from 'jsbi';

describe('PancakeSwap CLMM — amount conversion (BigInt / scientific notation)', () => {
  it('should handle amounts > 1000 tokens without BigInt conversion error', () => {
    // 1500 USDT with 18 decimals → would previously produce "1.5e+21"
    const amount = 1500;
    const decimals = 18;
    const result = utils.parseUnits(amount.toString(), decimals).toString();

    expect(result).toBe('1500000000000000000000');
    expect(() => BigNumber.from(result)).not.toThrow();
    expect(() => JSBI.BigInt(result)).not.toThrow();
  });

  it('should produce correct raw amount for small amounts', () => {
    const amount = 0.01;
    const decimals = 6; // e.g. USDC
    const result = utils.parseUnits(amount.toString(), decimals).toString();

    expect(result).toBe('10000');
    expect(() => BigNumber.from(result)).not.toThrow();
    expect(() => JSBI.BigInt(result)).not.toThrow();
  });

  it('should produce correct raw amount for 1 token with 18 decimals', () => {
    const amount = 1;
    const decimals = 18;
    const result = utils.parseUnits(amount.toString(), decimals).toString();

    expect(result).toBe('1000000000000000000');
    expect(() => BigNumber.from(result)).not.toThrow();
    expect(() => JSBI.BigInt(result)).not.toThrow();
  });

  it('legacy Math.pow approach fails for large amounts (documents the bug)', () => {
    // This test documents the original bug: Math.floor produces a float string
    // in scientific notation for large amounts, which BigInt cannot parse.
    const amount = 1500;
    const decimals = 18;
    const legacyResult = Math.floor(amount * Math.pow(10, decimals)).toString();

    // The legacy approach produces scientific notation for large amounts
    expect(legacyResult).toBe('1.5e+21');

    // BigNumber.from and JSBI.BigInt both reject scientific notation strings
    expect(() => BigNumber.from(legacyResult)).toThrow();
    expect(() => JSBI.BigInt(legacyResult)).toThrow();
  });
});

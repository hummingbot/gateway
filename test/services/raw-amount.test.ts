import { BigNumber } from 'ethers';
import JSBI from 'jsbi';

import { toRawAmount } from '../../src/services/raw-amount';

// A thousand tokens with 18 decimals is 1e21 raw units, and that is where a JS number starts
// printing in exponent form. The previous conversion produced "1e+21" there, which JSBI.BigInt
// and BigNumber.from both refuse, so a Uniswap CLMM open-position with 1000 of an 18-decimal
// token failed before it reached the chain (#622).
describe('toRawAmount', () => {
  it('keeps a raw amount at and above 1e21 in plain digits', () => {
    expect(toRawAmount(1000, 18)).toBe('1000000000000000000000');
    expect(Math.floor(1000 * Math.pow(10, 18)).toString()).toBe('1e+21'); // what it replaces
    expect(() => JSBI.BigInt(toRawAmount(1000, 18))).not.toThrow();
    expect(() => BigNumber.from(toRawAmount(25000, 18))).not.toThrow();
  });

  it('is exact where float multiplication is not', () => {
    // 0.1 * 1e18 and 1.1 * 1e18 are not integers in binary floating point
    expect(toRawAmount(0.1, 18)).toBe('100000000000000000');
    expect(toRawAmount(1.1, 18)).toBe('1100000000000000000');
    expect(toRawAmount(123456.789, 6)).toBe('123456789000');
  });

  it('cuts to the smallest unit the token has, as the floor did, instead of refusing extra digits', () => {
    // parseUnits(amount.toString()) throws on more decimals than the token carries
    expect(toRawAmount(0.1234567890123, 6)).toBe('123456');
    expect(toRawAmount(1, 0)).toBe('1');
    expect(toRawAmount(0, 18)).toBe('0');
  });

  it('expands a small amount that a JS number prints in exponent form', () => {
    expect(String(1e-8)).toBe('1e-8');
    expect(toRawAmount(1e-8, 18)).toBe('10000000000');
    expect(toRawAmount(2.5e-7, 9)).toBe('250');
    expect(toRawAmount(1.5e21, 0)).toBe('1500000000000000000000');
  });
});

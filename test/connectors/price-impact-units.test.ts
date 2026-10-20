import { priceImpactPercentFromFraction } from '../../src/connectors/router-utils';

// `QuoteSwapResponse.priceImpactPct` is documented as "Estimated price impact percentage
// (0-100)". Jupiter's field of the same name is a decimal fraction, and it was passed
// through unconverted — 100x low, in the direction that makes a bad trade look harmless.
// Any guard of the form `if (priceImpactPct > 5) reject` could never fire. The Jupiter
// and DFlow quote route tests check the converted value in their responses.

describe('priceImpactPercentFromFraction', () => {
  it('reads a fraction as the percentage the schema documents', () => {
    // Measured on SOL-USDC: a 20,000 SOL sell reported 0.001260 against a true impact of
    // 0.134% computed from the quoted prices — agreement to within the fee.
    expect(priceImpactPercentFromFraction('0.001260')).toBeCloseTo(0.126, 6);
    expect(priceImpactPercentFromFraction(0.0126)).toBeCloseTo(1.26, 6);
  });

  it('carries a sentinel through as the total it claims to be', () => {
    // Jupiter returns 1.0 on thin pools where it cannot compute an impact. Under the
    // documented reading that was a 1% impact; it is 100%, which is at least visible.
    expect(priceImpactPercentFromFraction('1.0')).toBe(100);
  });

  it('treats a missing value as zero rather than NaN', () => {
    expect(priceImpactPercentFromFraction(undefined)).toBe(0);
    expect(priceImpactPercentFromFraction(null)).toBe(0);
    expect(priceImpactPercentFromFraction('')).toBe(0);
  });
});

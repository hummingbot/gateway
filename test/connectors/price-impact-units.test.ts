import fs from 'fs';
import path from 'path';

import { priceImpactPercentFromFraction } from '../../src/connectors/router-utils';

// `QuoteSwapResponse.priceImpactPct` is documented as "Estimated price impact percentage
// (0-100)". Jupiter's field of the same name is a decimal fraction, and it was passed
// through unconverted — 100x low, in the direction that makes a bad trade look harmless.
// Any guard of the form `if (priceImpactPct > 5) reject` could never fire.

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

// The regression is a passthrough, not a wrong formula: `parseFloat(x.priceImpactPct)`
// straight into the unified response. This catches that shape wherever it reappears,
// including in a connector that does not exist yet.
describe('no connector publishes a router fraction as a percentage', () => {
  const connectorsDir = path.join(__dirname, '../../src/connectors');

  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
    });

  it('converts every fraction it publishes', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(connectorsDir)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        // The unified field being assigned a parsed router fraction, with no conversion.
        const assignment = line.match(/^\s*priceImpactPct:\s*(.+)$/);
        if (!assignment) continue;
        const rhs = assignment[1];
        if (/parseFloat\(/.test(rhs) && !/priceImpactPercentFromFraction|\*\s*100/.test(rhs)) {
          offenders.push(`${path.relative(connectorsDir, file)}: ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('finds assignments to check, so the check cannot pass vacuously', () => {
    const assignments = sourceFiles(connectorsDir).filter((file) =>
      /priceImpactPct:/.test(fs.readFileSync(file, 'utf8')),
    );

    expect(assignments.length).toBeGreaterThanOrEqual(8);
  });
});

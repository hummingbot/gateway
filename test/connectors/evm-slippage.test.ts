import fs from 'fs';
import path from 'path';

import { slippageBasisPoints } from '../../src/connectors/evm-slippage';

describe('slippageBasisPoints', () => {
  it('converts a percentage to the /10000 numerator the SDKs take', () => {
    expect(slippageBasisPoints(1)).toBe(100);
    expect(slippageBasisPoints(2)).toBe(200);
    expect(slippageBasisPoints(5)).toBe(500);
  });

  it('handles a sub-percent tolerance', () => {
    expect(slippageBasisPoints(0.5)).toBe(50);
  });

  it('rounds to whole basis points, which is what the denominator can express', () => {
    expect(slippageBasisPoints(0.123)).toBe(12);
  });
});

// The defect was not the conversion, it was that there was no conversion: four CLMM
// liquidity routes wrote `new Percent(100, 10000)` and called it slippage, ignoring both
// the caller's slippagePct and the operator's configured one. An operator who widened
// slippagePct for a volatile pair still got 1%, and a revert that cost gas.
//
// This is a source check because that is the shape of the invariant — "no route builds a
// tolerance from a literal" is a statement about every route, including ones not written
// yet, and no unit test of a helper can make it.
describe('no connector builds a slippage tolerance from a literal', () => {
  const connectorsDir = path.join(__dirname, '../../src/connectors');

  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
    });

  it('derives every slippageTolerance from a slippagePct', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(connectorsDir)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        const assignment = line.match(/slippageTolerance\s*=\s*(.+)$/);
        if (!assignment) continue;
        // Any right-hand side that mentions a slippage value passes; uniswap's swap
        // paths bind theirs to a local `slippage` first. What must not appear is a bare
        // number, which is what all four liquidity routes had.
        if (!/slippage/i.test(assignment[1])) {
          offenders.push(`${path.relative(connectorsDir, file)}: ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('finds tolerances to check, so the check cannot pass vacuously', () => {
    const withTolerance = sourceFiles(connectorsDir).filter((file) =>
      /slippageTolerance\s*=/.test(fs.readFileSync(file, 'utf8')),
    );

    expect(withTolerance.length).toBeGreaterThanOrEqual(4);
  });
});

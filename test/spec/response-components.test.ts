import fs from 'fs';
import path from 'path';

/**
 * The response half of the generated-client contract.
 *
 * GW-9 and GW-10 named every request; the responses kept the names they had before the
 * two surfaces existed side by side, so the unprefixed one was the CLMM one and a reader
 * had to know that: `PoolInfo` against `AmmPoolInfo`, `AddLiquidityResponse` against
 * `AmmAddLiquidityResponse`. `QuotePositionResponse` was worse — the route was renamed to
 * quote-liquidity in the refactor and its response kept the old word, so the two twins
 * disagreed on both halves of the name.
 */
const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../openapi.json'), 'utf8'));

/** The component a route answers with, unwrapping an array response to its item. */
const responseComponent = (op: any): string | undefined => {
  const schema = op?.responses?.['200']?.content?.['application/json']?.schema;
  const ref = schema?.$ref ?? schema?.items?.$ref;
  return ref?.replace('#/components/schemas/', '');
};

const tradingRoutes = (type: 'amm' | 'clmm'): Array<[string, any]> =>
  Object.entries(spec.paths as Record<string, any>)
    .filter(([route]) => route.startsWith(`/trading/${type}/`))
    .flatMap(([route, ops]) => Object.values(ops as Record<string, any>).map((op) => [route, op] as [string, any]));

describe('every trading response is a named component', () => {
  it.each([...tradingRoutes('amm'), ...tradingRoutes('clmm')].map(([route, op]) => [route, op]))(
    '%s answers with a component',
    (_route, op) => {
      expect(responseComponent(op)).toBeDefined();
    },
  );

  // Shared shapes are deliberately unprefixed: both surfaces really do answer a swap with
  // the same body, and giving that two names would claim a difference that is not there.
  const SHARED = ['ChainExecuteSwapResponse', 'ChainQuoteSwapResponse'];

  it('names an AMM response Amm… and its CLMM twin Clmm…', () => {
    const byOperation = new Map<string, { amm?: string; clmm?: string }>();
    for (const type of ['amm', 'clmm'] as const) {
      for (const [route, op] of tradingRoutes(type)) {
        const operation = route.split('/').pop()!;
        byOperation.set(operation, { ...byOperation.get(operation), [type]: responseComponent(op) });
      }
    }

    const asymmetric: string[] = [];
    for (const [operation, { amm, clmm }] of byOperation) {
      if (!amm || !clmm) continue;
      if (SHARED.includes(amm) && amm === clmm) continue;
      if (!amm.startsWith('Amm') || !clmm.startsWith('Clmm')) {
        asymmetric.push(`${operation}: ${amm} / ${clmm}`);
      }
    }

    expect(asymmetric).toEqual([]);
  });

  // A component holding a name its route no longer uses is the GW-10 trap. Pinned by name
  // because the shapes are what they always were — only the labels were wrong.
  it.each([
    ['QuotePositionResponse', 'the route is quote-liquidity now'],
    ['PoolInfo', 'ambiguous between the two surfaces'],
    ['PositionInfo', 'ambiguous between the two surfaces'],
    ['AddLiquidityResponse', 'ambiguous between the two surfaces'],
    ['CreatePoolResponse', 'ambiguous between the two surfaces'],
  ])('no longer publishes %s (%s)', (name) => {
    expect(Object.keys(spec.components.schemas)).not.toContain(name);
  });
});

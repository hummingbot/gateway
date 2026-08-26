import { attemptedRoute } from '../../src/connectors/router-utils';

// A no-route error is the one message a caller may act on automatically — it reads as
// "this token is untradable", and the routers' own comments record callers blacklisting
// good pools over a mislabelled one. Every router built this message from the SELL shape
// and reused it for BUY, so a BUY that failed named the opposite direction and the
// opposite mode: a route nobody had tried.

describe('attemptedRoute', () => {
  it('describes a SELL as ExactIn, base to quote', () => {
    expect(attemptedRoute('SELL', 'DOGE-1', 'SOL')).toBe('DOGE-1 -> SOL (ExactIn)');
  });

  it('describes a BUY as ExactOut, quote to base', () => {
    // The live case: a BUY of DOGE-1 with approximation declined was reported as
    // "No route found for DOGE-1 -> SOL (ExactIn)" — both halves wrong, and wrong in
    // the direction that condemns a token which routes ExactIn perfectly well.
    expect(attemptedRoute('BUY', 'DOGE-1', 'SOL')).toBe('SOL -> DOGE-1 (ExactOut)');
  });

  it('takes an explicit mode for a router whose executable mode differs from the side', () => {
    // OKX names its own mode; the direction still follows the side.
    expect(attemptedRoute('BUY', 'DOGE-1', 'SOL', 'exactOut')).toBe('SOL -> DOGE-1 (exactOut)');
    expect(attemptedRoute('BUY', 'DOGE-1', 'SOL', 'ExactOut, ExactIn fallback failed')).toBe(
      'SOL -> DOGE-1 (ExactOut, ExactIn fallback failed)',
    );
  });

  it('never reports the two sides the same way', () => {
    expect(attemptedRoute('BUY', 'A', 'B')).not.toBe(attemptedRoute('SELL', 'A', 'B'));
  });
});

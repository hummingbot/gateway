import { NATIVE_MINT } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

import { liquidityWithoutRent } from '../../../../src/chains/solana/solana.utils';

const OTHER_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC

// Both routes back the accounts' lamports out of a native-token side, for the same reason
// and in the same direction: at open the wallet's SOL change carries what the position's
// accounts locked, at close it carries what they gave back. Neither figure is liquidity.
// One helper serves both, so these run against the code the routes call rather than a
// restatement of it. What goes in comes from accountLifecycleSol — see
// test/chains/solana/account-lifecycle.test.ts.
describe('liquidityWithoutRent', () => {
  const RENT = 0.0099;

  it('leaves the liquidity when the native change carries the rent', () => {
    // The live case that found this: 0.0152 left the wallet, 0.0053 of it was liquidity.
    expect(liquidityWithoutRent(-0.0152083, NATIVE_MINT, RENT)).toBeCloseTo(0.0053083, 7);
  });

  it('leaves a non-native side untouched, since no rent rode on it', () => {
    expect(liquidityWithoutRent(-3000, OTHER_MINT, RENT)).toBe(3000);
  });

  it('is direction-agnostic: the sign comes off before the rent comes out', () => {
    expect(liquidityWithoutRent(0.0152083, NATIVE_MINT, RENT)).toBeCloseTo(0.0053083, 7);
  });

  it('clamps rather than reporting a negative deposit', () => {
    // A native change smaller than the rent means the rent dominated the transaction.
    // Zero is the truthful reading; a negative would be arithmetic leaking into a field
    // that means a quantity of tokens.
    expect(liquidityWithoutRent(-0.001, NATIVE_MINT, RENT)).toBe(0);
  });

  it('is a no-op when no rent moved', () => {
    expect(liquidityWithoutRent(-0.0152083, NATIVE_MINT, 0)).toBeCloseTo(0.0152083, 7);
  });

  it('would clamp every native side to zero if handed lamports', () => {
    // Why accountLifecycleSol returns SOL and says so. The units have to agree; if they
    // do not, this is the shape of the failure — silent, and total.
    expect(liquidityWithoutRent(-0.0152083, NATIVE_MINT, RENT * 1e9)).toBe(0);
  });
});

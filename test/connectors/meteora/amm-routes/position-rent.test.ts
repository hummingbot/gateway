import { NATIVE_MINT } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

import { accountBalanceSol, liquidityWithoutRent } from '../../../../src/chains/solana/solana.utils';

// positionRent / positionRentRefunded are read out of the landed transaction: the
// position account's post-balance at open is the rent it now holds, and its
// pre-balance at close is exactly what comes back to the wallet. These pin that
// extraction, including the versioned-transaction case where the account is loaded
// from an address-lookup table — preBalances/postBalances are indexed over the
// combined key list, so resolving against static keys alone would read the wrong
// account's lamports.

const POSITION = new PublicKey('11111111111111111111111111111112');
const OTHER = new PublicKey('So11111111111111111111111111111111111111112');
const OTHER_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
const RENT_LAMPORTS = 57_500_000; // 0.0575 SOL

const legacyTx = (keys: PublicKey[], pre: number[], post: number[]) => ({
  transaction: {
    message: {
      getAccountKeys: () => ({ get: (i: number) => keys[i] }),
    },
  },
  meta: { preBalances: pre, postBalances: post },
});

const versionedTx = (staticKeys: PublicKey[], loaded: PublicKey[], pre: number[], post: number[]) => ({
  transaction: {
    message: {
      // Mirrors web3.js: with the lookups supplied, the combined list is returned;
      // without them, only the static keys resolve.
      getAccountKeys: (opts?: any) => {
        const keys = opts?.accountKeysFromLookups ? [...staticKeys, ...loaded] : staticKeys;
        return { get: (i: number) => keys[i] };
      },
    },
  },
  meta: { preBalances: pre, postBalances: post, loadedAddresses: { writable: loaded, readonly: [] } },
});

describe('position rent extraction', () => {
  it('reads the rent a close refunds from the position account pre-balance', () => {
    const tx = legacyTx([OTHER, POSITION], [1_000_000_000, RENT_LAMPORTS], [1_057_000_000, 0]);

    expect(accountBalanceSol(tx, POSITION, 'pre')).toBeCloseTo(0.0575);
  });

  it('reads the rent an open locks from the position account post-balance', () => {
    const tx = legacyTx([OTHER, POSITION], [1_000_000_000, 0], [942_000_000, RENT_LAMPORTS]);

    expect(accountBalanceSol(tx, POSITION, 'post')).toBeCloseTo(0.0575);
  });

  it('resolves an account loaded from a lookup table', () => {
    // The position is the 3rd entry in the combined list, so its balance is at index 2.
    const tx = versionedTx([OTHER, OTHER], [POSITION], [1_000_000_000, 5, RENT_LAMPORTS], [1_057_000_000, 5, 0]);

    expect(accountBalanceSol(tx, POSITION, 'pre')).toBeCloseTo(0.0575);
  });

  it('returns null when the account took no part in the transaction', () => {
    const tx = legacyTx([OTHER], [1_000_000_000], [1_000_000_000]);

    // Distinguishable from a genuine zero, so a caller never reports rent it did not read.
    expect(accountBalanceSol(tx, POSITION, 'pre')).toBeNull();
  });

  it('returns null when the transaction carries no balances', () => {
    expect(accountBalanceSol({ transaction: { message: {} }, meta: {} }, POSITION, 'pre')).toBeNull();
  });
});

// The unit is the reason this matters twice over. accountBalanceSol divides the raw
// lamport balances, so what it returns is directly subtractable from the SOL-denominated
// token amounts the two routes report. Being out by 1e9 here would be silent — the
// subtraction would clamp to 0 and every native side would read as depositing nothing.
describe('the rent is reported in SOL, not lamports', () => {
  it('divides the raw lamport balance', () => {
    const tx = legacyTx([OTHER, POSITION], [RENT_LAMPORTS, 0], [0, RENT_LAMPORTS]);

    expect(accountBalanceSol(tx, POSITION, 'post')).toBe(RENT_LAMPORTS / 1e9);
    expect(accountBalanceSol(tx, POSITION, 'post')).toBeLessThan(1);
  });
});

// Both routes back the rent out of a native-token side, for the same reason and in the
// same direction: at open the wallet's SOL change carries the rent it locked, at close it
// carries the rent that came back. Neither figure is liquidity. One helper serves both,
// so these run against the code the routes call rather than a restatement of it.
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
    // Why accountBalanceSol returns SOL and says so. The units have to agree; if they do
    // not, this is the shape of the failure — silent, and total.
    expect(liquidityWithoutRent(-0.0152083, NATIVE_MINT, RENT * 1e9)).toBe(0);
  });
});

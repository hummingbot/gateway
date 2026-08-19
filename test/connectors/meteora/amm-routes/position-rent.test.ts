import { PublicKey } from '@solana/web3.js';

import { accountLamports } from '../../../../src/chains/solana/solana.utils';

// positionRent / positionRentRefunded are read out of the landed transaction: the
// position account's post-balance at open is the rent it now holds, and its
// pre-balance at close is exactly what comes back to the wallet. These pin that
// extraction, including the versioned-transaction case where the account is loaded
// from an address-lookup table — preBalances/postBalances are indexed over the
// combined key list, so resolving against static keys alone would read the wrong
// account's lamports.

const POSITION = new PublicKey('11111111111111111111111111111112');
const OTHER = new PublicKey('So11111111111111111111111111111111111111112');
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

    expect(accountLamports(tx, POSITION, 'pre')).toBeCloseTo(0.0575);
  });

  it('reads the rent an open locks from the position account post-balance', () => {
    const tx = legacyTx([OTHER, POSITION], [1_000_000_000, 0], [942_000_000, RENT_LAMPORTS]);

    expect(accountLamports(tx, POSITION, 'post')).toBeCloseTo(0.0575);
  });

  it('resolves an account loaded from a lookup table', () => {
    // The position is the 3rd entry in the combined list, so its balance is at index 2.
    const tx = versionedTx([OTHER, OTHER], [POSITION], [1_000_000_000, 5, RENT_LAMPORTS], [1_057_000_000, 5, 0]);

    expect(accountLamports(tx, POSITION, 'pre')).toBeCloseTo(0.0575);
  });

  it('returns null when the account took no part in the transaction', () => {
    const tx = legacyTx([OTHER], [1_000_000_000], [1_000_000_000]);

    // Distinguishable from a genuine zero, so a caller never reports rent it did not read.
    expect(accountLamports(tx, POSITION, 'pre')).toBeNull();
  });

  it('returns null when the transaction carries no balances', () => {
    expect(accountLamports({ transaction: { message: {} }, meta: {} }, POSITION, 'pre')).toBeNull();
  });
});

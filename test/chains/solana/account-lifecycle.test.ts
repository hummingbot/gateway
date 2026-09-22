import { NATIVE_MINT } from '@solana/spl-token';

import { accountLifecycleSol, liquidityWithoutRent } from '../../../src/chains/solana/solana.utils';

// Every case here is a real mainnet transaction, reduced to the balance arrays the helper
// reads. The numbers are lamports as the chain reported them, so the assertions are
// against what actually happened rather than against a restatement of the arithmetic.
//
// The defect these pin: the routes used to subtract the position account's rent alone.
// A position is more than one account — on DAMM v2 the NFT mint and its token account are
// rent-bearing too, on a PancakeSwap CLMM there are five — so the rest of the rent stayed
// inside the reported deposit or withdrawal and was published as liquidity.

const OTHER_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
const NFT_MINT = '4tBDJGjDGTEzLGdcNo3RmpNGVJz7NEQzoXKMcXBmr3wS';

const tx = (accounts: { pre: number; post: number; wrapped?: { pre?: number; post?: number }; mint?: string }[]) => ({
  meta: {
    preBalances: accounts.map((a) => a.pre),
    postBalances: accounts.map((a) => a.post),
    preTokenBalances: accounts
      .map((a, accountIndex) => ({ a, accountIndex }))
      .filter(({ a }) => a.wrapped?.pre !== undefined || (a.mint && a.pre > 0))
      .map(({ a, accountIndex }) => ({
        accountIndex,
        mint: a.mint ?? NATIVE_MINT.toBase58(),
        uiTokenAmount: { amount: String(a.wrapped?.pre ?? 1) },
      })),
    postTokenBalances: accounts
      .map((a, accountIndex) => ({ a, accountIndex }))
      .filter(({ a }) => a.wrapped?.post !== undefined || (a.mint && a.post > 0))
      .map(({ a, accountIndex }) => ({
        accountIndex,
        mint: a.mint ?? NATIVE_MINT.toBase58(),
        uiTokenAmount: { amount: String(a.wrapped?.post ?? 1) },
      })),
  },
});

describe('accountLifecycleSol', () => {
  // 67ZzMAHv… — closing the last DAMM v2 position. Four accounts closed; the old code
  // saw one of them, so 0.0219 SOL was recorded as withdrawn against a real payout of
  // 0.0053 — 4.1x.
  describe('a DAMM v2 close, which closes four accounts', () => {
    const dammClose = tx([
      { pre: 2_568_527_013, post: 2_594_123_858 }, // the wallet
      { pre: 4_127_280, post: 0 }, // position NFT mint
      { pre: 2_039_280, post: 0, mint: NFT_MINT }, // the NFT's token account
      { pre: 3_730_560, post: 0 }, // the position
      { pre: 10_413_811, post: 0, wrapped: { pre: 8_374_531 } }, // the wallet's WSOL account
      { pre: 605_757_454_563, post: 605_752_155_435 }, // the pool vault
    ]);

    it('totals every closed account, not the position alone', () => {
      expect(accountLifecycleSol(dammClose).closed).toBeCloseTo(0.020310931, 9);
    });

    it('counts a wrapped balance the wallet already held as returned, but not as rent', () => {
      // 0.008374531 WSOL was sitting in that account before the transaction. It comes
      // back with the rent and has to leave the liquidity figure, but calling it rent
      // would overstate what the position cost to hold.
      expect(accountLifecycleSol(dammClose).rentRefunded).toBeCloseTo(0.0119364, 9);
    });

    it('leaves exactly the pool payout behind', () => {
      // Wallet delta 0.025596845 + fee 0.000013214 — extractBalanceChangesAndFee adds the
      // fee back for the payer — against the vault's own outflow of 0.005299128.
      const change = 0.025610059;
      const { closed } = accountLifecycleSol(dammClose);

      expect(liquidityWithoutRent(change, NATIVE_MINT, closed)).toBeCloseTo(0.005299128, 9);
    });
  });

  // 2CMNt7Bk… — the first pancakeswap-sol open. Five accounts created, 0.01364856 SOL of
  // rent, against 0.009987471 actually deposited: the rent was the larger number.
  describe('a PancakeSwap CLMM open, which creates five accounts', () => {
    const clmmOpen = tx([
      { pre: 2_573_201_337, post: 2_549_475_306 }, // the wallet
      { pre: 0, post: 4_231_680 }, // the position
      { pre: 0, post: 2_039_280, wrapped: { post: 0 } }, // a fresh WSOL account, spent to zero
      { pre: 0, post: 2_074_080, mint: '3ttZ9NfqLnZmnDwazMvnCMsLpx58grFS6xvE8xYNhiRd' }, // NFT account
      { pre: 0, post: 2_456_880 }, // the shared protocol position
      { pre: 0, post: 2_846_640 }, // a tick array this range was first to touch
      { pre: 8_337_552_804_054, post: 8_337_562_791_525 }, // the pool vault
    ]);

    it('totals every created account', () => {
      expect(accountLifecycleSol(clmmOpen).opened).toBeCloseTo(0.01364856, 9);
    });

    it('leaves exactly what reached the pool vault', () => {
      // Wallet delta 0.023726031 less the 0.00009 gas the helper reports separately.
      const { opened } = accountLifecycleSol(clmmOpen);

      expect(liquidityWithoutRent(-0.023636031, NATIVE_MINT, opened)).toBeCloseTo(0.009987471, 9);
    });

    it('reports rent equal to the total when nothing was left wrapped', () => {
      const { opened, rentLocked } = accountLifecycleSol(clmmOpen);

      expect(rentLocked).toBeCloseTo(opened, 12);
    });
  });

  // Cy8wiJaS… — the close of that same position, and the sharpest case in the set: the
  // whole native movement was rent, so the number published as liquidity withdrawn was
  // rent to the lamport. The SOL itself never touched the native balance (GW-30).
  describe('a PancakeSwap CLMM close that left its SOL wrapped', () => {
    const clmmClose = tx([
      { pre: 2_549_410_306, post: 2_558_477_706 }, // the wallet
      { pre: 2_074_080, post: 0, mint: '3ttZ9NfqLnZmnDwazMvnCMsLpx58grFS6xvE8xYNhiRd' }, // NFT account
      { pre: 2_846_640, post: 0 }, // the tick array
      { pre: 4_231_680, post: 0 }, // the position
      { pre: 2_039_999, post: 10_413_811, wrapped: { pre: 719, post: 8_374_531 } }, // WSOL, not unwrapped
    ]);

    it('accounts for the three closed accounts', () => {
      expect(accountLifecycleSol(clmmClose).closed).toBeCloseTo(0.0091524, 9);
    });

    it('reports nothing withdrawn natively, because nothing was', () => {
      // The reported figure was 0.0091524 — the rent, relabelled. Subtracting it leaves
      // the zero that is true of the native balance; the 0.008373812 that came out of the
      // pool went to the WSOL account, which is what GW-30's unwrap is for.
      const { closed } = accountLifecycleSol(clmmClose);

      expect(liquidityWithoutRent(0.0091524, NATIVE_MINT, closed)).toBe(0);
    });

    it('does not count an account that only changed balance', () => {
      // The WSOL account went 0.002039999 -> 0.010413811. It neither opened nor closed,
      // so none of it belongs to either total.
      const { opened, closed } = accountLifecycleSol(clmmClose);

      expect(opened).toBe(0);
      expect(closed).toBeCloseTo(0.0091524, 9);
    });
  });

  describe('accounts that do not move rent', () => {
    it('ignores an account created and closed within the same transaction', () => {
      // A WSOL account opened to receive a withdrawal and unwrapped in the same
      // transaction: its lamports never left the wallet, so neither total may claim them.
      const sameTx = tx([
        { pre: 1_000_000_000, post: 1_008_000_000 },
        { pre: 0, post: 0 },
      ]);

      expect(accountLifecycleSol(sameTx)).toEqual({ opened: 0, closed: 0, rentLocked: 0, rentRefunded: 0 });
    });

    it('ignores a balance that merely changed', () => {
      const noLifecycle = tx([
        { pre: 1_000_000_000, post: 900_000_000 },
        { pre: 5, post: 500 },
      ]);

      expect(accountLifecycleSol(noLifecycle).opened).toBe(0);
      expect(accountLifecycleSol(noLifecycle).closed).toBe(0);
    });

    it('reads a transaction with no balances as no movement', () => {
      expect(accountLifecycleSol({ meta: {} })).toEqual({ opened: 0, closed: 0, rentLocked: 0, rentRefunded: 0 });
    });

    it('does not treat a non-native token balance as wrapped SOL', () => {
      // A closed USDC account's whole pre-balance is rent; only WSOL carries a balance
      // that is somebody's money rather than the account's deposit.
      const usdcClosed = tx([
        { pre: 1_000_000_000, post: 1_002_039_280 },
        { pre: 2_039_280, post: 0, mint: OTHER_MINT },
      ]);

      expect(accountLifecycleSol(usdcClosed).rentRefunded).toBeCloseTo(0.00203928, 9);
    });
  });

  it('reports SOL, not lamports', () => {
    // The totals are subtracted from token amounts. Being out by 1e9 would clamp every
    // native side to zero without any error.
    const one = tx([{ pre: 1_000_000_000, post: 0 }]);

    expect(accountLifecycleSol(one).closed).toBe(1);
  });
});

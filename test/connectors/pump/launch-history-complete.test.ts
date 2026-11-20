/**
 * `complete` says the whole history was read. A listing that stops at the cap on a
 * full page has not shown that: with a cap of 1,000, a coin with more transactions
 * returned one full page and called it complete.
 */
import { NATIVE_MINT } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

jest.mock('../../../src/connectors/pump/pump', () => ({ Pump: { getInstance: jest.fn() } }));

import { getLaunchHistory } from '../../../src/connectors/pump/launch-routes/history';
import { Pump } from '../../../src/connectors/pump/pump';

const MINT = PublicKey.unique();

// Failed transactions are listed and counted but never fetched, which keeps this to
// the paging.
const failed = (n: number) => Array.from({ length: n }, (_, i) => ({ signature: `sig${i}`, err: {} }));

const historyOver = async (pages: unknown[][], maxTransactions: number) => {
  const getSignaturesForAddress = jest.fn();
  pages.forEach((page) => getSignaturesForAddress.mockResolvedValueOnce(page));
  (Pump.getInstance as jest.Mock).mockResolvedValue({
    solana: { connection: { getSignaturesForAddress } },
    getCurveState: jest
      .fn()
      .mockResolvedValue({ quoteMint: NATIVE_MINT, bondingCurve: { creator: PublicKey.unique() } }),
    canonicalPoolAddress: jest.fn().mockReturnValue(PublicKey.unique()),
  });
  const history = await getLaunchHistory('mainnet-beta', MINT.toBase58(), undefined, maxTransactions);
  return { history, getSignaturesForAddress };
};

describe('pump launch history: complete', () => {
  it('is true when the listing ran out before the cap', async () => {
    const { history } = await historyOver([failed(40)], 1000);

    expect(history.complete).toBe(true);
  });

  it('is false when a full page stopped at the cap and older transactions remain', async () => {
    const { history, getSignaturesForAddress } = await historyOver([failed(1000), failed(1)], 1000);

    expect(history.complete).toBe(false);
    expect(getSignaturesForAddress).toHaveBeenLastCalledWith(MINT, { before: 'sig999', limit: 1 });
  });

  it('is true when a full page stopped at the cap and nothing lies past it', async () => {
    const { history } = await historyOver([failed(1000), []], 1000);

    expect(history.complete).toBe(true);
  });

  it('is false when the listing ran past the cap', async () => {
    const { history } = await historyOver([failed(40)], 10);

    expect(history.complete).toBe(false);
  });
});

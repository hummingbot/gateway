/**
 * A listed token asked for by its mint is reported under its symbol, the same key it
 * has when asked for by symbol, whether or not the wallet holds a token account for it.
 * An unlisted mint is reported under the mint.
 */
import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';

const OWNER = Keypair.generate().publicKey.toBase58();
const LISTED = Keypair.generate().publicKey.toBase58();
const UNLISTED = Keypair.generate().publicKey.toBase58();

const solanaHolding = (accounts: Record<string, number>) => {
  const instance = Object.create(Solana.prototype);
  instance.getSolBalance = jest.fn().mockResolvedValue(1);
  instance.getTokenList = jest.fn().mockResolvedValue([{ address: LISTED, symbol: 'LISTED', decimals: 6 }]);
  instance.fetchTokenAccounts = jest
    .fn()
    .mockResolvedValue(
      new Map(Object.entries(accounts).map(([mint, uiAmount]) => [mint, { parsedAccount: { uiAmount } }])),
    );
  instance.getTokenBalanceWithMintInfo = jest.fn(async (account: any) => account.parsedAccount.uiAmount);
  return instance as Solana;
};

describe('getBalances by mint', () => {
  it('reports a listed mint under its symbol', async () => {
    const balances = await solanaHolding({ [LISTED]: 5, [UNLISTED]: 7 }).getBalances(OWNER, [LISTED, UNLISTED]);

    expect(balances).toEqual({ LISTED: 5, [UNLISTED]: 7 });
  });

  it('refuses a listed token of another mint that calls itself SOL, rather than overwrite native SOL', async () => {
    const solana = solanaHolding({ [LISTED]: 5 });
    (solana as any).getTokenList = jest.fn().mockResolvedValue([{ address: LISTED, symbol: 'SOL', decimals: 6 }]);

    await expect(solana.getBalances(OWNER, [LISTED])).rejects.toThrow(
      `Token list entry ${LISTED} has the symbol SOL, which names native SOL`,
    );
  });

  it('uses the same keys for a wallet with no token accounts', async () => {
    const balances = await solanaHolding({}).getBalances(OWNER, [LISTED, UNLISTED]);

    expect(balances).toEqual({ LISTED: 0, [UNLISTED]: 0 });
  });
});

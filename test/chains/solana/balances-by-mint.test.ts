/**
 * A balance is reported under the name it was asked for with: a mint under that mint,
 * exactly as sent, and a symbol under the token list's symbol, whether or not the wallet
 * holds a token account for it. A client stores the balance under the key in the answer
 * and looks it up under the name it sent, so a mint answered under a symbol is a balance
 * it never finds. Which token each entry is travels beside it.
 */
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';
import { balanceResponse } from '../../../src/chains/wallet-balances';

const OWNER = Keypair.generate().publicKey.toBase58();
const LISTED = Keypair.generate().publicKey.toBase58();
const UNLISTED = Keypair.generate().publicKey.toBase58();
const WRAPPED = NATIVE_MINT.toBase58();

const solanaHolding = (accounts: Record<string, number>) => {
  const instance = Object.create(Solana.prototype);
  instance.getSolBalance = jest.fn().mockResolvedValue(1);
  instance.getTokenList = jest.fn().mockResolvedValue([
    { address: LISTED, symbol: 'LISTED', decimals: 6 },
    { address: WRAPPED, symbol: 'SOL', decimals: 9 },
  ]);
  instance.fetchTokenAccounts = jest
    .fn()
    .mockResolvedValue(
      new Map(Object.entries(accounts).map(([mint, uiAmount]) => [mint, { parsedAccount: { uiAmount } }])),
    );
  instance.getTokenBalanceWithMintInfo = jest.fn(async (account: any) => account.parsedAccount.uiAmount);
  return instance as Solana;
};

describe('getBalances by mint', () => {
  it('reports a mint under the mint, listed or not', async () => {
    const balances = await solanaHolding({ [LISTED]: 5, [UNLISTED]: 7 }).getBalances(OWNER, [LISTED, UNLISTED]);

    expect(balances).toEqual({ [LISTED]: 5, [UNLISTED]: 7 });
  });

  it('reports a symbol under the token list symbol, whatever its case', async () => {
    expect(await solanaHolding({ [LISTED]: 5 }).getBalances(OWNER, ['listed'])).toEqual({ LISTED: 5 });
  });

  it('answers under both names when a token is asked for by both', async () => {
    const balances = await solanaHolding({ [LISTED]: 5 }).getBalances(OWNER, ['LISTED', LISTED]);

    expect(balances).toEqual({ LISTED: 5, [LISTED]: 5 });
  });

  it('uses the same keys for a wallet with no token accounts', async () => {
    const balances = await solanaHolding({}).getBalances(OWNER, [LISTED, UNLISTED]);

    expect(balances).toEqual({ [LISTED]: 0, [UNLISTED]: 0 });
  });

  it('says which token each entry is, whichever way it was asked for', async () => {
    const entries = await solanaHolding({ [LISTED]: 5, [UNLISTED]: 7 }).getTokenBalances(OWNER, [
      'SOL',
      LISTED,
      UNLISTED,
      'NOT-A-TOKEN',
    ]);

    expect(balanceResponse(entries)).toEqual({
      balances: { SOL: 1, [LISTED]: 5, [UNLISTED]: 7, 'NOT-A-TOKEN': 0 },
      tokens: [
        { key: 'SOL', symbol: 'SOL', address: null, balance: 1 },
        { key: LISTED, symbol: 'LISTED', address: LISTED, balance: 5 },
        { key: UNLISTED, symbol: null, address: UNLISTED, balance: 7 },
      ],
    });
  });

  it('reads the wrapped-SOL mint as the wrapped token account, not the native balance', async () => {
    const solana = solanaHolding({ [WRAPPED]: 0.25 });

    expect(await solana.getBalances(OWNER, [WRAPPED])).toEqual({ [WRAPPED]: 0.25 });
    expect(await solana.getTokenBalances(OWNER, ['SOL', WRAPPED])).toEqual([
      { key: 'SOL', symbol: 'SOL', address: null, balance: 1 },
      { key: WRAPPED, symbol: 'WSOL', address: WRAPPED, balance: 0.25 },
    ]);
    expect(await solanaHolding({}).getBalances(OWNER, [WRAPPED])).toEqual({ [WRAPPED]: 0 });
  });
});

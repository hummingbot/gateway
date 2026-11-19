/**
 * Wrapped SOL is a token balance the wallet can spend, but the token list names its mint
 * 'SOL' and that key is the native balance. It is reported as 'WSOL': in the default
 * view when the wallet holds some, and always when asked for by name. Asked for by its
 * mint it is reported under the mint (see balances-by-mint.test.ts).
 */
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';

const OWNER = Keypair.generate().publicKey.toBase58();
const WRAPPED = NATIVE_MINT.toBase58();

const solanaHolding = (accounts: Record<string, number>) => {
  const instance = Object.create(Solana.prototype);
  instance.getSolBalance = jest.fn().mockResolvedValue(1);
  instance.getTokenList = jest.fn().mockResolvedValue([{ address: WRAPPED, symbol: 'SOL', decimals: 9 }]);
  instance.fetchTokenAccounts = jest
    .fn()
    .mockResolvedValue(
      new Map(Object.entries(accounts).map(([mint, uiAmount]) => [mint, { parsedAccount: { uiAmount } }])),
    );
  return instance as Solana;
};

describe('getBalances with wrapped SOL', () => {
  it('lists a wrapped balance beside the native one', async () => {
    expect(await solanaHolding({ [WRAPPED]: 0.25 }).getBalances(OWNER)).toEqual({ SOL: 1, WSOL: 0.25 });
  });

  it('leaves WSOL out of the default view when the wallet holds none', async () => {
    expect(await solanaHolding({}).getBalances(OWNER)).toEqual({ SOL: 1 });
    expect(await solanaHolding({ [WRAPPED]: 0 }).getBalances(OWNER)).toEqual({ SOL: 1 });
  });

  it('answers a request for WSOL by name, held or not', async () => {
    expect(await solanaHolding({ [WRAPPED]: 0.25 }).getBalances(OWNER, ['wsol'])).toEqual({ WSOL: 0.25 });
    expect(await solanaHolding({}).getBalances(OWNER, ['SOL', 'WSOL'])).toEqual({ SOL: 1, WSOL: 0 });
  });

  it('does not add WSOL to a request that did not name it', async () => {
    expect(await solanaHolding({ [WRAPPED]: 0.25 }).getBalances(OWNER, ['SOL'])).toEqual({ SOL: 1 });
  });
});

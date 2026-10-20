/**
 * Native SOL is the native mint, not a symbol. Any mint's metadata can say "SOL", so a
 * token that claims the symbol must still be measured by its own mint.
 */
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';

const OWNER = Keypair.generate().publicKey.toBase58();
const IMPOSTOR = Keypair.generate().publicKey.toBase58();
const USDC = Keypair.generate().publicKey.toBase58();

const solanaWith = (changes: Record<string, number>) => {
  const instance = Object.create(Solana.prototype);
  instance.extractBalanceChangesAndFee = jest.fn(async (_sig: string, _owner: string, tokens: string[]) => ({
    balanceChanges: tokens.map((t) => changes[t]),
    fee: 0,
    txDetails: { meta: { preBalances: [], postBalances: [] } },
  }));
  return instance as Solana & { extractBalanceChangesAndFee: jest.Mock };
};

describe('extractClmmBalanceChanges', () => {
  it('reads a token that calls itself SOL by its own mint', async () => {
    const solana = solanaWith({ [NATIVE_MINT.toBase58()]: -0.01, [IMPOSTOR]: -250, [USDC]: -10 });

    const result = await solana.extractClmmBalanceChanges(
      'sig',
      OWNER,
      { address: IMPOSTOR, symbol: 'SOL' },
      { address: USDC, symbol: 'USDC' },
    );

    expect(solana.extractBalanceChangesAndFee.mock.calls[0][2]).toEqual([NATIVE_MINT.toBase58(), IMPOSTOR, USDC]);
    expect(result.baseTokenChange).toBe(-250);
    expect(result.quoteTokenChange).toBe(-10);
  });

  it('reads the native mint from the native balance, whatever its symbol', async () => {
    const solana = solanaWith({ [NATIVE_MINT.toBase58()]: -0.5, [USDC]: -10 });

    const result = await solana.extractClmmBalanceChanges(
      'sig',
      OWNER,
      { address: NATIVE_MINT.toBase58(), symbol: 'WSOL' },
      { address: USDC, symbol: 'USDC' },
    );

    expect(solana.extractBalanceChangesAndFee.mock.calls[0][2]).toEqual([NATIVE_MINT.toBase58(), USDC]);
    expect(result.baseTokenChange).toBe(-0.5);
  });
});

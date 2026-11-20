/**
 * getBalances for a mint that is not in the token list, asked for by address: the
 * wallet's token accounts are read from both token programs, and the balance uses the
 * decimals read from the mint through the program that owns it (Token-2022 here). The
 * default list-only view still leaves the mint out.
 */
const mockGetMint = jest.fn();
jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual('@solana/spl-token'),
  getMint: (...args: any[]) => mockGetMint(...args),
}));

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';
import { encodedTokenAccount } from '../../helpers/solanaTokenAccounts';

const OWNER = Keypair.generate().publicKey;
const UNLISTED = Keypair.generate().publicKey;
const LISTED = Keypair.generate().publicKey;

const solana = () => {
  const instance = Object.create(Solana.prototype);
  instance.getTokenList = jest.fn().mockResolvedValue([{ address: LISTED.toBase58(), symbol: 'LISTED', decimals: 9 }]);
  instance.connection = {
    getBalance: jest.fn().mockResolvedValue(1_000_000_000),
    getTokenAccountsByOwner: jest.fn(async (_owner: PublicKey, filter: { programId: PublicKey }) => ({
      value: filter.programId.equals(TOKEN_2022_PROGRAM_ID)
        ? [encodedTokenAccount(OWNER, UNLISTED, 68_959_507_220_357n, TOKEN_2022_PROGRAM_ID)]
        : [encodedTokenAccount(OWNER, LISTED, 5_000_000_000n, TOKEN_PROGRAM_ID)],
    })),
  };
  return instance as Solana;
};

describe('getBalances for an unlisted mint', () => {
  beforeEach(() => mockGetMint.mockReset());

  it('reads its balance with the decimals of the mint, through the program that owns it', async () => {
    mockGetMint.mockResolvedValue({ decimals: 6 });

    const balances = await solana().getBalances(OWNER.toBase58(), [UNLISTED.toBase58()]);

    expect(balances).toEqual({ [UNLISTED.toBase58()]: 68_959_507.220357 });
    expect(mockGetMint.mock.calls[0][1].equals(UNLISTED)).toBe(true);
    expect(mockGetMint.mock.calls[0][3].equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });

  it('says so when the mint cannot be read, rather than guessing its decimals', async () => {
    mockGetMint.mockRejectedValue(new Error('TokenInvalidAccountOwnerError'));

    await expect(solana().getBalances(OWNER.toBase58(), [UNLISTED.toBase58()])).rejects.toThrow(
      `Failed to read mint ${UNLISTED.toBase58()} through token program ${TOKEN_2022_PROGRAM_ID.toBase58()}: TokenInvalidAccountOwnerError`,
    );
  });

  it('keeps a rate limit on the mint read a 429', async () => {
    const limited = Object.assign(new Error('rate limited'), { statusCode: 429 });
    mockGetMint.mockRejectedValue(limited);

    await expect(solana().getBalances(OWNER.toBase58(), [UNLISTED.toBase58()])).rejects.toBe(limited);
  });

  it('still leaves it out of the default list-only view', async () => {
    const balances = await solana().getBalances(OWNER.toBase58());

    expect(balances).toEqual({ SOL: 1, LISTED: 5 });
    expect(mockGetMint).not.toHaveBeenCalled();
  });
});

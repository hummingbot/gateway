/**
 * Reading a token's identity from the chain.
 *
 * Solana keeps only decimals on the mint; the name and symbol are in one of two other
 * places, so both are tried. What matters as much as finding them is the cases that
 * find nothing: they have to answer "not a token" rather than fail, because the callers
 * are recording paths that must not disturb the request that triggered them.
 */
const mockGetAccountInfo = jest.fn();
const mockGetMint = jest.fn();
const mockGetTokenMetadata = jest.fn();

jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual('@solana/spl-token'),
  getMint: (...args: any[]) => mockGetMint(...args),
  getTokenMetadata: (...args: any[]) => mockGetTokenMetadata(...args),
}));

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';

const MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

// Only the connection is stood in for; fetchTokenFromChain itself is the real method.
const solanaWith = (connection: any): Solana => {
  const instance = Object.create(Solana.prototype);
  instance.connection = connection;
  return instance;
};

const chain = () => solanaWith({ getAccountInfo: mockGetAccountInfo });

// A Metaplex metadata account as the program lays it out: 65 bytes of key, update
// authority and mint, then name and symbol as 4-byte lengths followed by null-padded
// bytes of 32 and 10 — the widths the program reserves.
const metadataAccount = (name: string, symbol: string) => {
  const data = Buffer.alloc(115);
  data.writeUInt32LE(32, 65);
  data.write(name, 69, 'utf8');
  data.writeUInt32LE(10, 101);
  data.write(symbol, 105, 'utf8');
  return { owner: TOKEN_PROGRAM_ID, data };
};

/** Legacy mint at MINT, its metadata account at the PDA. */
const legacyMintWithMetadata = (name: string, symbol: string) =>
  mockGetAccountInfo.mockImplementation(async (key: PublicKey) =>
    key.toBase58() === MINT ? { owner: TOKEN_PROGRAM_ID } : metadataAccount(name, symbol),
  );

beforeEach(() => jest.clearAllMocks());

describe('Solana.fetchTokenFromChain', () => {
  it('reads a Token-2022 mint through its metadata extension', async () => {
    mockGetAccountInfo.mockResolvedValue({ owner: TOKEN_2022_PROGRAM_ID });
    mockGetMint.mockResolvedValue({ decimals: 6 });
    mockGetTokenMetadata.mockResolvedValue({ name: 'PayPal USD', symbol: 'PYUSD' });

    await expect(chain().fetchTokenFromChain(MINT)).resolves.toEqual({
      address: MINT,
      chainId: 101,
      decimals: 6,
      name: 'PayPal USD',
      symbol: 'PYUSD',
    });
  });

  // A legacy mint has no extension, so the metadata account is the only source. The
  // account's bytes are laid out here exactly as the program writes them.
  it('reads a legacy mint through its Metaplex metadata account', async () => {
    legacyMintWithMetadata('Bonk', 'BONK');
    mockGetMint.mockResolvedValue({ decimals: 5 });

    await expect(chain().fetchTokenFromChain(MINT)).resolves.toEqual({
      address: MINT,
      chainId: 101,
      decimals: 5,
      name: 'Bonk',
      symbol: 'BONK',
    });
    expect(mockGetTokenMetadata).not.toHaveBeenCalled();
  });

  // Named on purpose: a name is reachable here, so the only thing standing between this
  // address and a token record is the unreadable mint. Without that check it would be
  // recorded as a real token with zero decimals, which prices every later amount wrong.
  it('answers null for a named address whose mint cannot be read', async () => {
    legacyMintWithMetadata('Not A Token', 'NOPE');
    mockGetMint.mockRejectedValue(new Error('TokenInvalidAccountOwnerError'));

    await expect(chain().fetchTokenFromChain(MINT)).resolves.toBeNull();
  });

  it('answers null for a mint with decimals but no name anywhere', async () => {
    mockGetAccountInfo.mockImplementation(async (key: PublicKey) =>
      key.toBase58() === MINT ? { owner: TOKEN_PROGRAM_ID } : null,
    );
    mockGetMint.mockResolvedValue({ decimals: 9 });

    await expect(chain().fetchTokenFromChain(MINT)).resolves.toBeNull();
  });

  it('answers null for something that is not an address, without a round trip', async () => {
    await expect(chain().fetchTokenFromChain('SOL')).resolves.toBeNull();
    expect(mockGetAccountInfo).not.toHaveBeenCalled();
  });

  it('answers null when the address has no account on chain', async () => {
    mockGetAccountInfo.mockResolvedValue(null);

    await expect(chain().fetchTokenFromChain(MINT)).resolves.toBeNull();
    expect(mockGetMint).not.toHaveBeenCalled();
  });
});

/**
 * Resolving an Ethereum token by symbol or address.
 *
 * The list is the only source for a symbol, but an address identifies a contract that
 * can be asked what it is. Until it was asked, every route that describes a pool by its
 * token addresses failed on any token the list omitted — Uniswap's pool-info answered
 * "Token information not found for pool" for a real pool on real tokens.
 *
 * The two properties that keep that from becoming a behaviour change everywhere: an
 * unknown symbol still resolves to nothing, and a listed token still comes from the list.
 */
import { Ethereum } from '../../../src/chains/ethereum/ethereum';

const LISTED = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  chainId: 1,
};
const PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';

const mockContract = { name: jest.fn(), symbol: jest.fn(), decimals: jest.fn() };

// Only the token list and the contract factory are stood in for; getToken itself, and
// the fetchTokenFromChain it falls back to, are the real methods.
const ethereumWith = (tokens: any[]): Ethereum => {
  const instance: any = Object.create(Ethereum.prototype);
  instance.chainId = 1;
  instance.getTokenList = jest.fn().mockResolvedValue(tokens);
  instance.getContract = jest.fn().mockReturnValue(mockContract);
  (instance as any).chainReadTokens = new Map();
  return instance;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockContract.name.mockResolvedValue('Pepe');
  mockContract.symbol.mockResolvedValue('PEPE');
  mockContract.decimals.mockResolvedValue(18);
});

describe('Ethereum.getToken', () => {
  it('returns a listed token without touching the chain', async () => {
    const ethereum = ethereumWith([LISTED]);

    await expect(ethereum.getToken('USDC')).resolves.toEqual(LISTED);
    await expect(ethereum.getToken(LISTED.address)).resolves.toEqual(LISTED);
    expect((ethereum as any).getContract).not.toHaveBeenCalled();
  });

  it('reads an unlisted address off the chain', async () => {
    const ethereum = ethereumWith([LISTED]);

    await expect(ethereum.getToken(PEPE)).resolves.toEqual({
      address: PEPE,
      chainId: 1,
      decimals: 18,
      name: 'Pepe',
      symbol: 'PEPE',
    });
  });

  // The containment property. A symbol names nothing the chain can be asked about, so
  // every caller that passes one — wrap, unwrap, an approve by symbol — is unaffected.
  it('still resolves an unknown symbol to nothing, without a round trip', async () => {
    const ethereum = ethereumWith([LISTED]);

    await expect(ethereum.getToken('NOSUCHTOKEN')).resolves.toBeUndefined();
    expect((ethereum as any).getContract).not.toHaveBeenCalled();
  });

  it('resolves an address that is not an ERC-20 to nothing', async () => {
    const ethereum = ethereumWith([LISTED]);
    mockContract.symbol.mockRejectedValue(new Error('call revert exception'));

    await expect(ethereum.getToken(PEPE)).resolves.toBeUndefined();
  });

  // getToken runs in loops — every token of a balance request, every position a wallet
  // owns — so an unlisted address must not cost three eth_calls on every pass.
  it('reads a given address from the chain only once', async () => {
    const ethereum = ethereumWith([LISTED]);

    await ethereum.getToken(PEPE);
    await ethereum.getToken(PEPE);
    await ethereum.getToken(PEPE);

    expect(mockContract.symbol).toHaveBeenCalledTimes(1);
  });

  // A miss is not remembered: an address with no contract today may have one tomorrow,
  // and a process that ran before the deploy should not be wrong until it restarts.
  it('does not remember an address that resolved to nothing', async () => {
    const ethereum = ethereumWith([LISTED]);
    mockContract.symbol.mockRejectedValueOnce(new Error('no contract yet'));

    await expect(ethereum.getToken(PEPE)).resolves.toBeUndefined();
    await expect(ethereum.getToken(PEPE)).resolves.toMatchObject({ symbol: 'PEPE' });
  });
});

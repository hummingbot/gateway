/**
 * Gateway learns tokens and pools from the chain as they are used.
 *
 * The risk these cover is not "did it save" but "did it save something wrong": the token
 * list is keyed by symbol and pools pair by symbol, so a placeholder name or a symbol
 * collision corrupts the lookups every later call depends on.
 */
const mockTokenService = {
  getToken: jest.fn(),
  addToken: jest.fn().mockResolvedValue(undefined),
};
const mockPoolService = {
  getPoolByAddress: jest.fn(),
  addPool: jest.fn().mockResolvedValue(undefined),
};
const mockSolana = { fetchTokenFromChain: jest.fn() };
const mockLogger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

jest.mock('../../src/services/logger', () => ({ logger: mockLogger }));

jest.mock('../../src/services/token-service', () => ({
  TokenService: { getInstance: () => mockTokenService },
}));
jest.mock('../../src/services/pool-service', () => ({
  PoolService: { getInstance: () => mockPoolService },
}));
jest.mock('../../src/chains/solana/solana', () => ({
  Solana: { getInstance: jest.fn().mockResolvedValue(mockSolana) },
}));
jest.mock('../../src/chains/ethereum/ethereum', () => ({
  Ethereum: { getInstance: jest.fn() },
}));

import { ensurePoolSaved, ensureTokenSaved } from '../../src/services/token-pool-autosave';

const BONK = {
  address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  symbol: 'BONK',
  name: 'Bonk',
  decimals: 5,
  chainId: 101,
};
const USDC = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  chainId: 101,
};

const poolFacts = {
  address: 'POOL',
  baseTokenAddress: BONK.address,
  quoteTokenAddress: USDC.address,
  feePct: 0.25,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTokenService.addToken.mockResolvedValue(undefined);
  mockPoolService.addPool.mockResolvedValue(undefined);
});

describe('ensureTokenSaved', () => {
  it('returns a token already in the list without reading the chain', async () => {
    mockTokenService.getToken.mockResolvedValue(USDC);

    await expect(ensureTokenSaved('solana', 'mainnet-beta', USDC.address)).resolves.toEqual(USDC);

    expect(mockSolana.fetchTokenFromChain).not.toHaveBeenCalled();
    expect(mockTokenService.addToken).not.toHaveBeenCalled();
  });

  it('reads an unknown address from the chain and adds it', async () => {
    mockTokenService.getToken.mockResolvedValue(null);
    mockSolana.fetchTokenFromChain.mockResolvedValue(BONK);

    await expect(ensureTokenSaved('solana', 'mainnet-beta', BONK.address)).resolves.toEqual(BONK);

    expect(mockTokenService.addToken).toHaveBeenCalledWith('solana', 'mainnet-beta', BONK);
  });

  // The chain gives decimals for any mint but a name for only some. Storing a token the
  // chain would not name means storing one under a name nothing invented it to match.
  it('stores nothing when the chain has no name for the token', async () => {
    mockTokenService.getToken.mockResolvedValue(null);
    mockSolana.fetchTokenFromChain.mockResolvedValue(null);

    await expect(ensureTokenSaved('solana', 'mainnet-beta', 'SomeUnnamedMint')).resolves.toBeNull();

    expect(mockTokenService.addToken).not.toHaveBeenCalled();
    // Declining to store is a decision, not a failure. Asserting the reported reason is
    // what separates it from tripping over the missing name and landing in the catch,
    // which also ends with nothing stored.
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('leaving it unlisted'));
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  // addToken treats a symbol collision as an update and rewrites the stored address, so
  // this is the case that would silently repoint an existing token. Wrapped SOL reports
  // its on-chain symbol as "SOL", which the list already holds for the native mint.
  it('refuses to save a token whose symbol is held by a different address', async () => {
    const wsolOnChain = { ...USDC, address: 'So11111111111111111111111111111111111111112', symbol: 'SOL' };
    mockTokenService.getToken.mockImplementation(async (_c: string, _n: string, key: string) =>
      key === 'SOL' ? { ...wsolOnChain, address: 'NativeSolAddress' } : null,
    );
    mockSolana.fetchTokenFromChain.mockResolvedValue(wsolOnChain);

    await expect(ensureTokenSaved('solana', 'mainnet-beta', wsolOnChain.address)).resolves.toBeNull();

    expect(mockTokenService.addToken).not.toHaveBeenCalled();
  });

  it('reports a storage failure without raising it at the caller', async () => {
    mockTokenService.getToken.mockResolvedValue(null);
    mockSolana.fetchTokenFromChain.mockResolvedValue(BONK);
    mockTokenService.addToken.mockRejectedValue(new Error('disk full'));

    await expect(ensureTokenSaved('solana', 'mainnet-beta', BONK.address)).resolves.toBeNull();
  });
});

describe('ensurePoolSaved', () => {
  const save = (fetchPoolInfo: any) =>
    ensurePoolSaved({
      chain: 'solana',
      network: 'mainnet-beta',
      connector: 'raydium',
      type: 'amm',
      poolAddress: 'POOL',
      fetchPoolInfo,
    });

  // The short-circuit is the whole cost story: a known pool must not reach the connector.
  it('does not fetch pool info for a pool it already knows', async () => {
    mockPoolService.getPoolByAddress.mockResolvedValue({ address: 'POOL' });
    const fetchPoolInfo = jest.fn();

    await save(fetchPoolInfo);

    expect(fetchPoolInfo).not.toHaveBeenCalled();
    expect(mockPoolService.addPool).not.toHaveBeenCalled();
  });

  it('records an unknown pool under the symbols of its two tokens', async () => {
    mockPoolService.getPoolByAddress.mockResolvedValue(null);
    mockTokenService.getToken.mockResolvedValue(null);
    mockSolana.fetchTokenFromChain.mockImplementation(async (address: string) =>
      address === BONK.address ? BONK : USDC,
    );

    await save(async () => poolFacts);

    expect(mockPoolService.addPool).toHaveBeenCalledWith('solana', 'mainnet-beta', {
      connector: 'raydium',
      type: 'amm',
      network: 'mainnet-beta',
      address: 'POOL',
      baseSymbol: 'BONK',
      quoteSymbol: 'USDC',
      baseTokenAddress: BONK.address,
      quoteTokenAddress: USDC.address,
      feePct: 0.25,
    });
  });

  // A pool is filed under its pair, so half a pair is not a lesser record — it is an
  // unusable one, and the token that did resolve is still worth keeping.
  it('records no pool when one of its tokens cannot be named', async () => {
    mockPoolService.getPoolByAddress.mockResolvedValue(null);
    mockTokenService.getToken.mockResolvedValue(null);
    mockSolana.fetchTokenFromChain.mockImplementation(async (address: string) =>
      address === BONK.address ? BONK : null,
    );

    await save(async () => poolFacts);

    expect(mockTokenService.addToken).toHaveBeenCalledWith('solana', 'mainnet-beta', BONK);
    expect(mockPoolService.addPool).not.toHaveBeenCalled();
    // As above: the skip is reported as a decision, and nothing was thrown to get here.
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('has no symbol'));
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('reports a connector failure without raising it at the caller', async () => {
    mockPoolService.getPoolByAddress.mockResolvedValue(null);

    await expect(
      save(async () => {
        throw new Error('pool not found on chain');
      }),
    ).resolves.toBeUndefined();

    expect(mockPoolService.addPool).not.toHaveBeenCalled();
  });
});

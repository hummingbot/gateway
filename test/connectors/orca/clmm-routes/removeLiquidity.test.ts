import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

// This previously mocked an `orca.removeLiquidity()` the connector never calls, then
// accepted [200, 400, 500] — so the success cases passed on a 500 from the unmocked SDK.
// The mocks below are what removeLiquidity actually calls.
const mockFetchPosition = jest.fn();
const mockFetchWhirlpool = jest.fn();
const mockFetchAllMint = jest.fn();
const mockDecreaseLiquidity = jest.fn();
const mockSendAndConfirm = jest.fn();

jest.mock('../../../../src/chains/solana/solana');
// The wallet default on the unified schema is read from conf/chains/solana.yml at module
// load. conf/ is gitignored, so a developer machine supplies a real address and CI falls
// back to the template's literal '<solana-wallet-address>' — which is not base58, so
// `new PublicKey(...)` throws and the route 500s. These two cases OMIT walletAddress on
// purpose, so they were passing only on machines that happened to have a wallet
// configured. Pin the default here instead of inheriting the ambient one.
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana.config'),
  getSolanaChainConfig: () => ({
    ...jest.requireActual('../../../../src/chains/solana/solana.config').getSolanaChainConfig(),
    defaultWallet: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
  }),
}));
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchPosition: (...a: any[]) => mockFetchPosition(...a),
  fetchWhirlpool: (...a: any[]) => mockFetchWhirlpool(...a),
}));
jest.mock('@orca-so/whirlpools', () => ({
  decreaseLiquidityInstructions: (...a: any[]) => mockDecreaseLiquidity(...a),
}));
jest.mock('@solana-program/token-2022', () => ({
  fetchAllMint: (...a: any[]) => mockFetchAllMint(...a),
}));
jest.mock('../../../../src/connectors/orca/orca.sdk', () => ({
  buildOrcaTransaction: jest.fn().mockReturnValue({ tx: true }),
  createOrcaAuthority: jest.fn().mockReturnValue('authority'),
}));

const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** The Orca and Solana surface removeLiquidity actually touches. */
const seedConnector = ({ removed = [1, 200] as [number, number] } = {}) => {
  (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {}, deployment: 'mainnet' });
  mockFetchPosition.mockResolvedValue({
    data: { whirlpool: POOL, positionMint: 'mint', liquidity: 1_000_000n },
  });
  mockFetchWhirlpool.mockResolvedValue({ data: { tokenMintA: SOL, tokenMintB: USDC } });
  // token-2022 mints carry an extensions option; the transfer-fee lookup reads it.
  mockFetchAllMint.mockResolvedValue([
    { data: { decimals: 9, extensions: { __option: 'None' } } },
    { data: { decimals: 6, extensions: { __option: 'None' } } },
  ]);
  mockDecreaseLiquidity.mockResolvedValue({
    instructions: [],
    quote: { tokenEstA: 1_000_000_000n, tokenEstB: 200_000_000n },
  });
  mockSendAndConfirm.mockResolvedValue({ signature: 'sig123', fee: 0.000005 });
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    sendAndConfirmTransactionForWallet: mockSendAndConfirm,
    getToken: jest.fn().mockImplementation((a: string) => ({ symbol: a === SOL ? 'SOL' : 'USDC', address: a })),
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: removed }),
  });
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { removeLiquidityRoute } = await import('../../../../src/trading/trading-clmm-routes/remove');
  await server.register(removeLiquidityRoute);
  return server;
};

describe('POST /remove-liquidity', () => {
  const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
  const mockPositionAddress = 'HqoV7Qv27REUtq26uVBhqmaipPC381dj7UceLn433SoH';
  let app: ReturnType<typeof fastifyWithTypeProvider>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('successful liquidity removal', () => {
    it('should remove liquidity with percentage', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        signature: 'sig123',
        status: 1,
        data: { poolAddress: POOL, positionAddress: mockPositionAddress },
      });
      // Half the position's liquidity, as asked.
      expect(mockDecreaseLiquidity).toHaveBeenCalledWith({}, 'mint', { liquidity: 500_000n }, expect.anything());
    });

    it('should remove 100% liquidity', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 100,
        },
      });

      expect(response.statusCode).toBe(200);
      // 100% takes the whole position, not a rounded-down fraction of it.
      expect(mockDecreaseLiquidity).toHaveBeenCalledWith({}, 'mint', { liquidity: 1_000_000n }, expect.anything());
    });

    it('should use default network and wallet', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          connector: 'orca',
          positionAddress: mockPositionAddress,
          percentageToRemove: 25,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(Orca.getInstance).toHaveBeenCalledWith('mainnet-beta');
      const [, sentFor] = mockSendAndConfirm.mock.calls[0];
      expect(typeof sentFor).toBe('string');
      expect(sentFor.length).toBeGreaterThan(0);
    });
  });

  describe('validation', () => {
    it('should return 400 when positionAddress is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    // Omitting percentageToRemove is not an error: the schema defaults it to 100. That
    // is a consequential default — the request that says least removes everything — so
    // it is pinned rather than assumed. The previous expectation here was an error,
    // which only ever passed because the unmocked SDK made every case a 500.
    it('removes the whole position when no percentage is given', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockDecreaseLiquidity).toHaveBeenCalledWith({}, 'mint', { liquidity: 1_000_000n }, expect.anything());
    });

    it('should handle invalid percentageToRemove values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 150,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      seedConnector();
      mockDecreaseLiquidity.mockRejectedValue(new Error('Remove liquidity failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

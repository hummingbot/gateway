import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

// This previously mocked an `orca.addLiquidity()` the connector never calls, then
// accepted [200, 400, 500] — so the success cases passed on a 500 from the unmocked SDK.
// The mocks below are what addLiquidity actually calls.
const mockFetchPosition = jest.fn();
const mockFetchWhirlpool = jest.fn();
const mockFetchAllMint = jest.fn();
const mockIncreaseLiquidity = jest.fn();
const mockQuoteA = jest.fn();
const mockQuoteB = jest.fn();
const mockSendAndConfirm = jest.fn();

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchPosition: (...a: any[]) => mockFetchPosition(...a),
  fetchWhirlpool: (...a: any[]) => mockFetchWhirlpool(...a),
}));
jest.mock('@orca-so/whirlpools', () => ({
  increaseLiquidityInstructions: (...a: any[]) => mockIncreaseLiquidity(...a),
}));
jest.mock('@orca-so/whirlpools-core', () => ({
  increaseLiquidityQuoteA: (...a: any[]) => mockQuoteA(...a),
  increaseLiquidityQuoteB: (...a: any[]) => mockQuoteB(...a),
}));
jest.mock('@solana-program/token-2022', () => ({
  fetchAllMint: (...a: any[]) => mockFetchAllMint(...a),
}));
jest.mock('../../../../src/connectors/orca/orca.sdk', () => ({
  buildOrcaTransaction: jest.fn().mockReturnValue({ tx: true }),
  createOrcaAuthority: jest.fn().mockReturnValue('authority'),
  replaceOrcaInstructionAccounts: jest.fn((i: any) => i),
}));

const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// tokenMax* is what increaseLiquidityQuote* returns after applying slippage to tokenEst*;
// they are kept distinct here so a test cannot pass on the wrong one by accident.
const QUOTE = {
  liquidityDelta: 500_000n,
  tokenEstA: 1_000_000_000n,
  tokenEstB: 200_000_000n,
  tokenMaxA: 1_010_000_000n,
  tokenMaxB: 202_000_000n,
};

/** The Orca and Solana surface addLiquidity actually touches. */
const seedConnector = ({ added = [1, 200] as [number, number] } = {}) => {
  (Orca.getInstance as jest.Mock).mockResolvedValue({
    solanaKitRpc: { getEpochInfo: () => ({ send: async () => ({ epoch: 1 }) }) },
    deployment: 'mainnet',
  });
  mockFetchPosition.mockResolvedValue({
    data: { whirlpool: POOL, positionMint: 'mint', tickLowerIndex: -100, tickUpperIndex: 100 },
  });
  mockFetchWhirlpool.mockResolvedValue({
    data: { tokenMintA: SOL, tokenMintB: USDC, tickCurrentIndex: 0, sqrtPrice: 1n },
  });
  // token-2022 mints carry an extensions option; the transfer-fee lookup reads it.
  mockFetchAllMint.mockResolvedValue([
    { data: { decimals: 9, extensions: { __option: 'None' } } },
    { data: { decimals: 6, extensions: { __option: 'None' } } },
  ]);
  mockQuoteA.mockReturnValue(QUOTE);
  mockQuoteB.mockReturnValue(QUOTE);
  mockIncreaseLiquidity.mockResolvedValue({ instructions: [], quote: QUOTE });
  mockSendAndConfirm.mockResolvedValue({ signature: 'sig123', fee: 0.000005 });
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    sendAndConfirmTransactionForWallet: mockSendAndConfirm,
    getToken: jest.fn().mockImplementation((a: string) => ({ symbol: a === SOL ? 'SOL' : 'USDC', address: a })),
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: added }),
  });
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { addLiquidityRoute } = await import('../../../../src/trading/trading-clmm-routes/add');
  await server.register(addLiquidityRoute);
  return server;
};

describe('POST /add-liquidity', () => {
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

  describe('successful liquidity addition', () => {
    // The builder applies slippageToleranceBps itself, so handing it the quote's already
    // inflated ceiling makes the ceiling the target. Found on a one-sided open, where
    // 1 USDC funded deposited 1.009999; an add to an existing position ran the same
    // arithmetic, and its own log line has always reported tokenEst*.
    it('deposits the quoted estimate, not the slippage ceiling', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockIncreaseLiquidity).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { tokenMaxA: QUOTE.tokenEstA, tokenMaxB: QUOTE.tokenEstB },
        expect.objectContaining({ slippageToleranceBps: expect.any(Number) }),
      );
    });

    it('should add liquidity with base token amount', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(parseWire(response.body)).toMatchObject({
        signature: 'sig123',
        status: 1,
        data: { poolAddress: POOL, positionAddress: mockPositionAddress, baseTokenAmountAdded: 1 },
      });
      // Only the base side was offered, so the quote is taken from it.
      expect(mockQuoteA).toHaveBeenCalled();
    });

    it('should add liquidity with quote token amount', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          quoteTokenAmount: 200,
        },
      });

      expect(response.statusCode).toBe(200);
      // Only the quote side was offered, so the quote is taken from it instead.
      expect(mockQuoteB).toHaveBeenCalled();
    });

    it('should add liquidity with both token amounts', async () => {
      seedConnector();

      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
          quoteTokenAmount: 200,
        },
      });

      expect(response.statusCode).toBe(200);
      // Both offered: the connector prices each side and takes the one that binds.
      expect(mockQuoteA).toHaveBeenCalled();
      expect(mockQuoteB).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should return 400 when positionAddress is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return error when no token amount provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid position address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: 'invalid',
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      const mockOrca = {
        addLiquidity: jest.fn().mockRejectedValue(new Error('Add liquidity failed')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/add',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

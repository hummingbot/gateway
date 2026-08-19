import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

// These previously mocked an `orca.collectFees()` the connector never calls, then
// accepted [200, 400, 500] — so every case passed on a 500 from the unmocked SDK and
// asserted nothing. The mocks below are the calls collectFees actually makes, which
// lets each case assert one definite outcome.

const mockFetchPosition = jest.fn();
const mockFetchWhirlpool = jest.fn();
const mockHarvest = jest.fn();
const mockSendAndConfirm = jest.fn();

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchPosition: (...a: any[]) => mockFetchPosition(...a),
  fetchWhirlpool: (...a: any[]) => mockFetchWhirlpool(...a),
}));
jest.mock('@orca-so/whirlpools', () => ({
  harvestPositionInstructions: (...a: any[]) => mockHarvest(...a),
}));
jest.mock('../../../../src/connectors/orca/orca.sdk', () => ({
  buildOrcaTransaction: jest.fn().mockReturnValue({ tx: true }),
  createOrcaAuthority: jest.fn().mockReturnValue('authority'),
}));

const WALLET = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
const POSITION = 'HqoV7Qv27REUtq26uVBhqmaipPC381dj7UceLn433SoH';
const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** The Orca and Solana surface collectFees actually touches. */
const seedConnector = ({ collected = [0.1, 20] as [number, number] } = {}) => {
  (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {}, deployment: 'mainnet' });
  mockFetchPosition.mockResolvedValue({ data: { whirlpool: POOL, positionMint: 'mint' } });
  mockFetchWhirlpool.mockResolvedValue({ data: { tokenMintA: SOL, tokenMintB: USDC } });
  mockHarvest.mockResolvedValue({ instructions: [], rewardsQuote: { rewards: [] } });
  mockSendAndConfirm.mockResolvedValue({ signature: 'sig123', fee: 0.000005 });
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    sendAndConfirmTransactionForWallet: mockSendAndConfirm,
    getToken: jest.fn().mockImplementation((a: string) => ({ symbol: a === SOL ? 'SOL' : 'USDC', address: a })),
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: collected }),
  });
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { collectFeesRoute } = await import('../../../../src/trading/trading-clmm-routes/collect-fees');
  await server.register(collectFeesRoute);
  return server;
};

const collect = (app: any, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/collect-fees', payload });

describe('POST /collect-fees (orca)', () => {
  let app: ReturnType<typeof fastifyWithTypeProvider>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app.close();
  });

  describe('successful fee collection', () => {
    it('collects fees and reports the amounts and the pool', async () => {
      seedConnector();

      const response = await collect(app, {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: WALLET,
        positionAddress: POSITION,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        signature: 'sig123',
        status: 1,
        data: { poolAddress: POOL, baseFeeAmountCollected: 0.1, quoteFeeAmountCollected: 20 },
      });
      expect(mockHarvest).toHaveBeenCalled();
    });

    it("falls back to the chain's default network when none is given", async () => {
      seedConnector();

      const response = await collect(app, {
        connector: 'orca',
        walletAddress: WALLET,
        positionAddress: POSITION,
      });

      expect(response.statusCode).toBe(200);
      // The schema default is solana-mainnet-beta, so the connector is built for it.
      expect(Orca.getInstance).toHaveBeenCalledWith('mainnet-beta');
    });

    it('falls back to the configured wallet when none is given', async () => {
      seedConnector();

      const response = await collect(app, {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        positionAddress: POSITION,
      });

      expect(response.statusCode).toBe(200);
      // Whatever the default resolves to, the transaction is sent for it rather than
      // for an empty address.
      const [, sentFor] = mockSendAndConfirm.mock.calls[0];
      expect(typeof sentFor).toBe('string');
      expect(sentFor.length).toBeGreaterThan(0);
    });

    it('reports zeros when the position has no fees to collect', async () => {
      seedConnector({ collected: [0, 0] });

      const response = await collect(app, {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: WALLET,
        positionAddress: POSITION,
      });

      // A no-op collection is a successful collection of nothing, not an error.
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        baseFeeAmountCollected: 0,
        quoteFeeAmountCollected: 0,
      });
    });
  });

  describe('validation', () => {
    it('rejects a request with no position address', async () => {
      const response = await collect(app, {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: WALLET,
      });

      expect(response.statusCode).toBe(400);
      expect(mockHarvest).not.toHaveBeenCalled();
    });

    it('surfaces an unreadable position rather than reporting a collection', async () => {
      seedConnector();
      mockFetchPosition.mockRejectedValue(new Error('Account not found'));

      const response = await collect(app, {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: WALLET,
        positionAddress: 'invalid',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(mockSendAndConfirm).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('does not report success when harvesting fails', async () => {
      seedConnector();
      mockHarvest.mockRejectedValue(new Error('Collect fees failed'));

      const response = await collect(app, {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: WALLET,
        positionAddress: POSITION,
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(mockSendAndConfirm).not.toHaveBeenCalled();
    });

    it('does not report success when the connector is unavailable', async () => {
      seedConnector();
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await collect(app, {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: WALLET,
        positionAddress: POSITION,
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(mockSendAndConfirm).not.toHaveBeenCalled();
    });
  });
});

import { fastifyWithTypeProvider } from '../../utils/testUtils';

// /trading/router/build-quote builds exactly the quote the caller holds — the one it
// was shown — for its own wallet to sign, through the execute-quote path in build
// mode.

const mockBuildUnsigned = jest.fn();
jest.mock('../../../src/trading/build-common', () => ({
  ...jest.requireActual('../../../src/trading/build-common'),
  buildUnsigned: (...args: any[]) => mockBuildUnsigned(...args),
}));

const mockExecuteQuote = jest.fn();
jest.mock('../../../src/trading/connector-registry', () => ({
  ...jest.requireActual('../../../src/trading/connector-registry'),
  getRouterOps: () => ({ executeQuote: (...args: any[]) => mockExecuteQuote(...args) }),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const SIGNER = 'CqP6b3XgfXamU3V1fgRvCTLN57fsxMUQKBj34mPwnoxH';
const BUILT = {
  transaction: Buffer.from('unsigned-tx').toString('base64'),
  feePayer: SIGNER,
  recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
  lastValidBlockHeight: 2,
  currentBlockHeight: 1,
  extraSigners: [],
};

describe('POST /trading/router/build-quote', () => {
  let app: any;

  beforeAll(async () => {
    app = fastifyWithTypeProvider();
    await app.register(require('@fastify/sensible'));
    const { buildQuoteRoute } = await import('../../../src/trading/trading-router-routes/buildQuote');
    await app.register(buildQuoteRoute);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockBuildUnsigned.mockReset();
    mockExecuteQuote.mockReset();
    // buildUnsigned runs the connector's execute path; the capture itself is covered
    // in test/chains/solana/build-mode.test.ts.
    mockBuildUnsigned.mockImplementation(async (_chain, _connector, _extra, run) => {
      await run();
      return BUILT;
    });
  });

  it('builds the cached quote through execute-quote', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/build-quote',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        walletAddress: WALLET,
        quoteId: 'q-1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(BUILT);
    expect(mockExecuteQuote).toHaveBeenCalledWith(WALLET, 'mainnet-beta', 'q-1');
    const [chain, connector] = mockBuildUnsigned.mock.calls[0];
    expect([chain, connector]).toEqual(['solana', 'jupiter']);
  });

  it("surfaces an expired quote as the connector's error, not a new quote", async () => {
    const { httpErrors } = jest.requireActual('../../../src/services/error-handler');
    mockBuildUnsigned.mockRejectedValue(httpErrors.badRequest('Quote not found or expired'));

    const response = await app.inject({
      method: 'POST',
      url: '/build-quote',
      payload: { chainNetwork: 'solana-mainnet-beta', connector: 'jupiter', walletAddress: WALLET, quoteId: 'gone' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/Quote not found or expired/);
  });
});

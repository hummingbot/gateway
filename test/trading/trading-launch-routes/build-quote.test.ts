/** POST /trading/launch/build-quote builds from a cached quote id, as execute-quote runs it. */
import { Keypair } from '@solana/web3.js';

import { fastifyWithTypeProvider } from '../../utils/testUtils';

const WALLET = Keypair.generate().publicKey.toBase58();
const BUILT = {
  transaction: 'dGVzdA==',
  feePayer: WALLET,
  recentBlockhash: 'hash',
  lastValidBlockHeight: 10,
  currentBlockHeight: 5,
  extraSigners: [],
};

const mockBuildUnsigned = jest.fn();
jest.mock('../../../src/trading/build-common', () => ({
  ...jest.requireActual('../../../src/trading/build-common'),
  buildUnsigned: (...args: any[]) => mockBuildUnsigned(...args),
}));

const mockExecuteQuote = jest.fn();
jest.mock('../../../src/trading/connector-registry', () => ({
  ...jest.requireActual('../../../src/trading/connector-registry'),
  getLaunchOps: () => ({ executeQuote: (...args: any[]) => mockExecuteQuote(...args) }),
}));

describe('POST /launch/build-quote', () => {
  let app: any;

  beforeAll(async () => {
    app = fastifyWithTypeProvider();
    await app.register(require('@fastify/sensible'));
    const { buildQuoteRoute } = await import('../../../src/trading/trading-launch-routes/build-quote');
    await app.register(buildQuoteRoute, { prefix: '/launch' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildUnsigned.mockImplementation(async (_chain, _connector, _shape, run) => {
      await run();
      return BUILT;
    });
  });

  it('builds the transaction execute-quote would sign for the quote id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/launch/build-quote',
      payload: { chainNetwork: 'solana-mainnet-beta', connector: 'meteora', walletAddress: WALLET, quoteId: 'lq-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject(BUILT);
    expect(mockBuildUnsigned.mock.calls[0][0]).toBe('solana');
    expect(mockExecuteQuote).toHaveBeenCalledWith(WALLET, 'mainnet-beta', 'lq-1');
  });

  it('passes the build shape to the capture', async () => {
    await app.inject({
      method: 'POST',
      url: '/launch/build-quote',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: WALLET,
        quoteId: 'lq-1',
        memo: 'app:ref=1',
      },
    });

    expect(mockBuildUnsigned.mock.calls[0][2]).toMatchObject({ memo: 'app:ref=1' });
  });

  it('refuses a request with no quote id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/launch/build-quote',
      payload: { chainNetwork: 'solana-mainnet-beta', connector: 'meteora', walletAddress: WALLET },
    });

    expect(response.statusCode).toBe(400);
  });
});

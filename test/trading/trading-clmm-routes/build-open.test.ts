/**
 * Route-level tests for /trading/clmm/build-open: the build gating (Solana-only) and
 * the capture plumbing between route and connector.
 * The connector itself is mocked; the capture mechanics are covered in
 * test/chains/solana/build-mode.test.ts.
 */
import { UnsignedTransactionCaptured } from '../../../src/chains/solana/solana-build-mode';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

jest.mock('../../../src/connectors/meteora/clmm-routes/openPosition', () => ({
  openPosition: jest.fn(),
}));
jest.mock('../../../src/connectors/pancakeswap-sol/clmm-routes/openPosition', () => ({
  openPosition: jest.fn(),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

const FAKE_BUILT = {
  transaction: Buffer.from('unsigned-tx').toString('base64'),
  feePayer: WALLET,
  recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
  lastValidBlockHeight: 424242,
  currentBlockHeight: 424100,
  extraSigners: [{ pubkey: 'CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3', signature: 'c2ln' }],
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { openPositionRoute } = await import('../../../src/trading/trading-clmm-routes/open');
  await server.register(openPositionRoute);
  return server;
};

const basePayload = {
  connector: 'meteora',
  chainNetwork: 'solana-mainnet-beta',
  walletAddress: WALLET,
  lowerPrice: 100,
  upperPrice: 200,
  poolAddress: '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3',
  baseTokenAmount: 0.1,
};

describe('POST /trading/clmm/build-open', () => {
  let server: any;
  let openPosition: jest.Mock;

  beforeAll(async () => {
    server = await buildApp();
    openPosition = require('../../../src/connectors/meteora/clmm-routes/openPosition').openPosition;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    openPosition.mockReset();
  });

  it('returns the captured unsigned transaction from the connector execute path', async () => {
    openPosition.mockImplementation(async () => {
      throw new UnsignedTransactionCaptured(FAKE_BUILT);
    });

    const response = await server.inject({ method: 'POST', url: '/build-open', payload: basePayload });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(FAKE_BUILT);
    // The exact same connector function the execute route runs, with the same arguments.
    expect(openPosition).toHaveBeenCalledWith(
      'mainnet-beta',
      WALLET,
      100,
      200,
      basePayload.poolAddress,
      0.1,
      undefined,
      undefined,
      undefined,
    );
  });

  it('rejects an EVM connector: build is Solana-only for now', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/build-open',
      payload: { ...basePayload, connector: 'uniswap', chainNetwork: 'ethereum-mainnet' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/Solana connectors only/);
    expect(openPosition).not.toHaveBeenCalled();
  });

  it('reports a connector that completed without building a transaction', async () => {
    openPosition.mockResolvedValue({ signature: 'oops-this-executed', status: 1 });

    const response = await server.inject({ method: 'POST', url: '/build-open', payload: basePayload });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/nothing to sign/);
  });

  it('applies the same amount validation as the execute route', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/build-open',
      payload: { ...basePayload, baseTokenAmount: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/greater than 0/);
    expect(openPosition).not.toHaveBeenCalled();
  });
});

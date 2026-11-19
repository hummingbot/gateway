import { fastifyWithTypeProvider } from '../../utils/testUtils';

const BUILT = {
  transaction: 'AQ==',
  feePayer: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
  recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
  lastValidBlockHeight: 2,
  currentBlockHeight: 1,
  extraSigners: [],
};
const buildUnsigned = jest.fn();
jest.mock('../../../src/trading/build-common', () => ({
  ...jest.requireActual('../../../src/trading/build-common'),
  buildUnsigned: (...a: unknown[]) => buildUnsigned(...a),
}));
const meteoraCollectFees = jest.fn();
jest.mock('../../../src/connectors/meteora/amm-routes/collectFees', () => ({
  collectFees: (...a: unknown[]) => meteoraCollectFees(...a),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { collectFeesRoute } = await import('../../../src/trading/trading-amm-routes/collect-fees');
  await server.register(collectFeesRoute);
  return server;
};

const body = {
  connector: 'meteora',
  chainNetwork: 'solana-mainnet-beta',
  walletAddress: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
  poolAddress: 'Pool1111111111111111111111111111111111111111',
  positionAddress: 'Pos11111111111111111111111111111111111111111',
};

describe('POST /trading/amm/collect-fees and build-collect-fees', () => {
  let server: any;
  beforeAll(async () => {
    server = await buildApp();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('builds the collect through the meteora connector, unsigned', async () => {
    buildUnsigned.mockImplementation(async (_chain, _connector, _shape, run) => {
      await run();
      return BUILT;
    });
    const response = await server.inject({ method: 'POST', url: '/build-collect-fees', payload: body });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(BUILT);
    expect(meteoraCollectFees).toHaveBeenCalledWith(
      'mainnet-beta',
      body.walletAddress,
      body.poolAddress,
      body.positionAddress,
    );
  });

  it('refuses an AMM whose positions hold no fees of their own', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/collect-fees',
      payload: { ...body, connector: 'raydium' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/must be equal to one of the allowed values/);
  });

  it('requires the position', async () => {
    const { positionAddress: _omit, ...withoutPosition } = body;
    const response = await server.inject({ method: 'POST', url: '/build-collect-fees', payload: withoutPosition });
    expect(response.statusCode).toBe(400);
  });
});

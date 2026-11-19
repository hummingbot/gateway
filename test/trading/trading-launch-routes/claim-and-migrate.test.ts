import { fastifyWithTypeProvider } from '../../utils/testUtils';

const BUILT = {
  transaction: 'AQ==',
  feePayer: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
  recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
  lastValidBlockHeight: 2,
  currentBlockHeight: 1,
  extraSigners: [],
};
jest.mock('../../../src/trading/build-common', () => ({
  ...jest.requireActual('../../../src/trading/build-common'),
  buildUnsigned: async (_chain: string, _connector: string, _shape: unknown, run: () => Promise<unknown>) => {
    await run();
    return BUILT;
  },
}));
const meteoraClaim = jest.fn();
const raydiumClaim = jest.fn();
const pumpClaim = jest.fn();
const meteoraMigrate = jest.fn();
jest.mock('../../../src/connectors/meteora/launch-routes/claimCreatorFees', () => ({
  claimCreatorFees: (...a: unknown[]) => meteoraClaim(...a),
}));
jest.mock('../../../src/connectors/raydium/launch-routes/claimCreatorFees', () => ({
  claimCreatorFees: (...a: unknown[]) => raydiumClaim(...a),
}));
jest.mock('../../../src/connectors/pump/launch-routes/creatorFees', () => ({
  claimCreatorFees: (...a: unknown[]) => pumpClaim(...a),
  getCreatorFees: jest.fn(),
}));
jest.mock('../../../src/connectors/meteora/launch-routes/migrate', () => ({
  migrateCurve: (...a: unknown[]) => meteoraMigrate(...a),
}));
jest.mock('../../../src/trading/connector-registry', () => ({
  ...jest.requireActual('../../../src/trading/connector-registry'),
  assertLaunchConnectorOnChain: jest.fn(),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const base = { chainNetwork: 'solana-mainnet-beta', walletAddress: WALLET };

describe('POST /trading/launch build-claim-creator-fees and build-migrate', () => {
  let server: any;
  beforeAll(async () => {
    server = fastifyWithTypeProvider();
    await server.register(require('@fastify/sensible'));
    const { creatorFeesRoute } = await import('../../../src/trading/trading-launch-routes/creator-fees');
    await server.register(creatorFeesRoute);
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(() => jest.clearAllMocks());

  const post = (url: string, payload: Record<string, unknown>) => server.inject({ method: 'POST', url, payload });

  it.each([
    ['meteora', meteoraClaim],
    ['raydium', raydiumClaim],
  ])('builds a %s claim for the named launch', async (connector, claim) => {
    const response = await post('/build-claim-creator-fees', { ...base, connector, baseMint: MINT });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(BUILT);
    expect(claim).toHaveBeenCalledWith('mainnet-beta', WALLET, MINT);
  });

  it('builds a pump claim across all the creator coins, and refuses a baseMint for it', async () => {
    expect((await post('/build-claim-creator-fees', { ...base, connector: 'pump' })).statusCode).toBe(200);
    expect(pumpClaim).toHaveBeenCalledWith('mainnet-beta', WALLET);
    const refused = await post('/build-claim-creator-fees', { ...base, connector: 'pump', baseMint: MINT });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().message).toMatch(/takes no baseMint/);
  });

  it('requires baseMint for a per-launch claim', async () => {
    const response = await post('/build-claim-creator-fees', { ...base, connector: 'meteora' });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/baseMint is required for meteora/);
    expect(meteoraClaim).not.toHaveBeenCalled();
  });

  it('builds a meteora migration, and refuses a launchpad that has none', async () => {
    expect((await post('/build-migrate', { ...base, connector: 'meteora', baseMint: MINT })).statusCode).toBe(200);
    expect(meteoraMigrate).toHaveBeenCalledWith('mainnet-beta', WALLET, MINT);
    expect((await post('/build-migrate', { ...base, connector: 'raydium', baseMint: MINT })).statusCode).toBe(400);
  });
});

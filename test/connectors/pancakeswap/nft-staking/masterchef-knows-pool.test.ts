import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');

const POOL_ADDRESS = '0x172fcd41e0913e95784454622d1c3724f546f849';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const masterchefKnowsPoolRoute = (
    await import('../../../../src/connectors/pancakeswap/nft-staking/masterchef-knows-pool')
  ).default;
  await server.register(masterchefKnowsPoolRoute);
  return server;
};

describe('POST /masterchef-knows-pool', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Happy Paths ────────────────────────────────────────────────────────────

  it('returns registered=true with pid for a known pool (pid > 0)', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      getV3PoolIdFromMasterChef: jest.fn().mockResolvedValue({ pid: 3, isRegistered: true }),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-knows-pool',
      payload: { network: 'bsc', poolAddress: POOL_ADDRESS },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.registered).toBe(true);
    expect(body.pid).toBe(3);
  });

  it('returns registered=true for pid-0 (CAKE/WBNB pool)', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      getV3PoolIdFromMasterChef: jest.fn().mockResolvedValue({ pid: 0, isRegistered: true }),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-knows-pool',
      payload: { network: 'bsc', poolAddress: POOL_ADDRESS },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.registered).toBe(true);
    expect(body.pid).toBe(0);
  });

  it('returns registered=false with no pid for an unknown pool', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      getV3PoolIdFromMasterChef: jest.fn().mockResolvedValue({ pid: 0, isRegistered: false }),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-knows-pool',
      payload: { network: 'bsc', poolAddress: '0x0000000000000000000000000000000000000001' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.registered).toBe(false);
    expect(body.pid).toBeUndefined();
  });

  it('defaults network to bsc when omitted', async () => {
    const getInstance = jest.fn().mockResolvedValue({
      getV3PoolIdFromMasterChef: jest.fn().mockResolvedValue({ pid: 1, isRegistered: true }),
    });
    (Pancakeswap.getInstance as jest.Mock).mockImplementation(getInstance);

    await server.inject({
      method: 'POST',
      url: '/masterchef-knows-pool',
      payload: { poolAddress: POOL_ADDRESS },
    });

    expect(getInstance).toHaveBeenCalledWith('bsc');
  });

  // ─── Missing / Invalid Parameters ───────────────────────────────────────────

  it('returns 400 when poolAddress is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-knows-pool',
      payload: { network: 'bsc' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-knows-pool',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────────

  it('uses the provided network value correctly', async () => {
    const getInstance = jest.fn().mockResolvedValue({
      getV3PoolIdFromMasterChef: jest.fn().mockResolvedValue({ pid: 5, isRegistered: true }),
    });
    (Pancakeswap.getInstance as jest.Mock).mockImplementation(getInstance);

    await server.inject({
      method: 'POST',
      url: '/masterchef-knows-pool',
      payload: { network: 'mainnet', poolAddress: POOL_ADDRESS },
    });

    expect(getInstance).toHaveBeenCalledWith('mainnet');
  });
});

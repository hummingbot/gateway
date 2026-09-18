// binCount must reach the connector from the unified route. It was silently
// dropped: the querystring schema had no binCount and the connector calls passed
// only (fastify, network, poolAddress), so `bins` could never be returned through
// /trading/clmm/pool-info even for connectors that support it.

const orcaGetPoolInfo = jest.fn();
const raydiumGetPoolInfo = jest.fn();
const uniswapGetPoolInfo = jest.fn();
const pancakeswapGetPoolInfo = jest.fn();
const meteoraGetPoolInfo = jest.fn();
const pancakeswapSolGetPoolInfo = jest.fn();

jest.mock('../../../src/connectors/orca/clmm-routes/poolInfo', () => ({ getPoolInfo: orcaGetPoolInfo }));
jest.mock('../../../src/connectors/raydium/clmm-routes/poolInfo', () => ({ getPoolInfo: raydiumGetPoolInfo }));
jest.mock('../../../src/connectors/uniswap/clmm-routes/poolInfo', () => ({ getPoolInfo: uniswapGetPoolInfo }));
jest.mock('../../../src/connectors/pancakeswap/clmm-routes/poolInfo', () => ({ getPoolInfo: pancakeswapGetPoolInfo }));
jest.mock('../../../src/connectors/meteora/clmm-routes/poolInfo', () => ({ getPoolInfo: meteoraGetPoolInfo }));
jest.mock('../../../src/connectors/pancakeswap-sol/clmm-routes/poolInfo', () => ({
  getPoolInfo: pancakeswapSolGetPoolInfo,
}));

import { poolsRoute } from '../../../src/trading/clmm/pools';
import { fastifyWithTypeProvider } from '../../utils/testUtils';
import { parseWire } from '../../utils/wire';

const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

const SAMPLE_POOL_INFO = {
  address: POOL,
  baseTokenAddress: 'So11111111111111111111111111111111111111112',
  quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  feePct: 0.04,
  price: 75.6,
  baseTokenAmount: 1,
  quoteTokenAmount: 2,
  activeBinId: -25813,
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  await server.register(poolsRoute, { prefix: '/trading/clmm' });
  return server;
};

describe('Unified CLMM pool-info binCount passthrough', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const m of [
      orcaGetPoolInfo,
      raydiumGetPoolInfo,
      uniswapGetPoolInfo,
      pancakeswapGetPoolInfo,
      meteoraGetPoolInfo,
      pancakeswapSolGetPoolInfo,
    ]) {
      m.mockResolvedValue(SAMPLE_POOL_INFO);
    }
  });

  const call = (connector: string, chainNetwork: string, binCount?: number) =>
    app.inject({
      method: 'GET',
      url: '/trading/clmm/pool-info',
      query: {
        connector,
        chainNetwork,
        poolAddress: POOL,
        ...(binCount === undefined ? {} : { binCount: String(binCount) }),
      },
    });

  it.each([
    ['orca', 'solana-mainnet-beta', () => orcaGetPoolInfo],
    ['raydium', 'solana-mainnet-beta', () => raydiumGetPoolInfo],
    ['uniswap', 'ethereum-mainnet', () => uniswapGetPoolInfo],
    ['pancakeswap', 'ethereum-bsc', () => pancakeswapGetPoolInfo],
  ])('forwards binCount to %s', async (connector, chainNetwork, getMock) => {
    const response = await call(connector, chainNetwork, 11);

    expect(response.statusCode).toBe(200);
    expect(getMock()).toHaveBeenCalledWith(expect.anything(), expect.any(String), POOL, 11);
  });

  it('defaults binCount to 0 when the caller omits it', async () => {
    const response = await call('orca', 'solana-mainnet-beta');

    expect(response.statusCode).toBe(200);
    expect(orcaGetPoolInfo).toHaveBeenCalledWith(expect.anything(), expect.any(String), POOL, 0);
  });

  it('does not pass binCount to meteora, which always returns its bins', async () => {
    const response = await call('meteora', 'solana-mainnet-beta', 11);

    expect(response.statusCode).toBe(200);
    expect(meteoraGetPoolInfo).toHaveBeenCalledWith(expect.anything(), expect.any(String), POOL);
  });

  it('returns the bins the connector produced', async () => {
    const bins = [{ binId: -25813, price: 75.6, baseTokenAmount: 1, quoteTokenAmount: 2 }];
    orcaGetPoolInfo.mockResolvedValue({ ...SAMPLE_POOL_INFO, bins });

    const response = await call('orca', 'solana-mainnet-beta', 1);

    expect(response.statusCode).toBe(200);
    expect(parseWire(response.body).bins).toEqual(bins);
  });

  it('rejects a binCount above the supported maximum', async () => {
    const response = await call('orca', 'solana-mainnet-beta', 500);

    expect(response.statusCode).toBe(400);
    expect(orcaGetPoolInfo).not.toHaveBeenCalled();
  });
});

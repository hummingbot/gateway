/**
 * GET /trading/launch/pool-info: dispatch to meteora (its Dynamic Bonding Curve),
 * a clear refusal for launchpads without a per-token pool, the chain guard, and
 * schema validation.
 */
import { fastifyWithTypeProvider } from '../../utils/testUtils';

jest.mock('../../../src/connectors/meteora/launch-routes/poolInfo', () => ({
  getPoolInfo: jest.fn(),
}));
jest.mock('../../../src/connectors/pump/launch-routes/poolInfo', () => ({
  getPoolInfo: jest.fn(),
}));

const POOL = 'FBS3nK2z8JPaVokhKefCiWs1Ub18U1YceY2ryNFSEcyW';
const MINT = 'So11111111111111111111111111111111111111112';

const INFO = {
  poolAddress: POOL,
  config: MINT,
  creator: MINT,
  baseMint: MINT,
  quoteMint: MINT,
  tokenProgram: MINT,
  isMigrated: false,
  migrationProgress: 0.25,
  quoteReserve: 2.5,
  migrationQuoteThreshold: 10,
  price: 0.000001,
  sqrtPrice: '1',
  totalTradingBaseFee: 0,
  totalTradingQuoteFee: 0.025,
  partnerQuoteFee: 0.01,
  creatorQuoteFee: 0.01,
  protocolQuoteFee: 0.005,
  baseDecimals: 6,
  quoteDecimals: 9,
};

describe('GET /trading/launch/pool-info', () => {
  let server: any;
  let getPoolInfo: jest.Mock;

  beforeAll(async () => {
    server = fastifyWithTypeProvider();
    await server.register(require('@fastify/sensible'));
    const { poolInfoRoute } = await import('../../../src/trading/trading-launch-routes/pool-info');
    await server.register(poolInfoRoute);
    getPoolInfo = require('../../../src/connectors/meteora/launch-routes/poolInfo').getPoolInfo;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    getPoolInfo.mockReset();
    getPoolInfo.mockResolvedValue(INFO);
  });

  it('dispatches to meteora by base mint', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/pool-info?connector=meteora&chainNetwork=solana-mainnet-beta&baseMint=${MINT}`,
    });
    expect(res.statusCode).toBe(200);
    // DecimalNumber fields serialize as decimal strings; compare by value.
    const body = res.json();
    const numeric = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, typeof INFO[k as keyof typeof INFO] === 'number' ? Number(v) : v]),
    );
    expect(numeric).toEqual(INFO);
    expect(getPoolInfo).toHaveBeenCalledWith('mainnet-beta', { poolAddress: undefined, baseMint: MINT });
  });

  it('dispatches to meteora by pool address', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/pool-info?connector=meteora&chainNetwork=solana-mainnet-beta&poolAddress=${POOL}`,
    });
    expect(res.statusCode).toBe(200);
    expect(getPoolInfo).toHaveBeenCalledWith('mainnet-beta', { poolAddress: POOL, baseMint: undefined });
  });

  it('dispatches pump to its bonding curve, which has no partner or protocol fee account', async () => {
    const pumpGetPoolInfo = require('../../../src/connectors/pump/launch-routes/poolInfo').getPoolInfo;
    const { partnerQuoteFee, protocolQuoteFee, creatorQuoteFee, sqrtPrice, ...curve } = INFO;
    pumpGetPoolInfo.mockResolvedValue({ ...curve, marketCap: 30 });
    const res = await server.inject({
      method: 'GET',
      url: `/pool-info?connector=pump&chainNetwork=solana-mainnet-beta&baseMint=${MINT}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('partnerQuoteFee');
    expect(Number(res.json().marketCap)).toBe(30);
    expect(pumpGetPoolInfo).toHaveBeenCalledWith('mainnet-beta', { poolAddress: undefined, baseMint: MINT });
    expect(getPoolInfo).not.toHaveBeenCalled();
  });

  it('refuses a connector on the wrong chain', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/pool-info?connector=meteora&chainNetwork=ethereum-mainnet&baseMint=${MINT}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/runs on solana, not ethereum/);
    expect(getPoolInfo).not.toHaveBeenCalled();
  });

  it('passes connector-level selector errors through as 400', async () => {
    getPoolInfo.mockRejectedValue(Object.assign(new Error('Pass poolAddress or baseMint'), { statusCode: 400 }));
    const res = await server.inject({
      method: 'GET',
      url: '/pool-info?connector=meteora&chainNetwork=solana-mainnet-beta',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Pass poolAddress or baseMint/);
  });

  it('validates the query: connector is required and enum-constrained', async () => {
    for (const url of [
      `/pool-info?chainNetwork=solana-mainnet-beta&baseMint=${MINT}`,
      `/pool-info?connector=nope&chainNetwork=solana-mainnet-beta&baseMint=${MINT}`,
      `/pool-info?connector=meteora&chainNetwork=solana-mainnet-beta&baseMint=${MINT}&extra=1`,
    ]) {
      const res = await server.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(400);
    }
  });
});

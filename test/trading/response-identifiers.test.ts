import { fastifyWithTypeProvider } from '../utils/testUtils';

// Every fund-moving response should name the pool — and, where one exists, the position
// — it acted on, so a stored record identifies its venue without the request that
// produced it. The AMM routes take the pool in the request and echo it. The CLMM write
// routes are position-addressed and never receive one, so the connector reports the pool
// it already loaded, and the route only adds the position the caller named.

const POOL = 'FAKEpoolAddress1111111111111111111111111111';
const POSITION = 'FAKEpositionAddress11111111111111111111111';
const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

const CONFIRMED_ADD = {
  signature: 'sig',
  status: 1,
  data: { fee: 0.00001, baseTokenAmountAdded: 1, quoteTokenAmountAdded: 2 },
};
const mockRaydiumAmmAdd = jest.fn();
const mockRaydiumAmmRemove = jest.fn();
const mockMeteoraAmmClose = jest.fn();
const mockMeteoraClmmClose = jest.fn();

jest.mock('../../src/connectors/raydium/amm-routes/addLiquidity', () => ({
  addLiquidity: (...a: any[]) => mockRaydiumAmmAdd(...a),
}));
jest.mock('../../src/connectors/raydium/amm-routes/removeLiquidity', () => ({
  removeLiquidity: (...a: any[]) => mockRaydiumAmmRemove(...a),
}));
jest.mock('../../src/connectors/meteora/amm-routes/openPosition', () => ({
  openPosition: jest.fn(),
}));
jest.mock('../../src/connectors/meteora/amm-routes/closePosition', () => ({
  closePosition: (...a: any[]) => mockMeteoraAmmClose(...a),
}));
jest.mock('../../src/connectors/meteora/clmm-routes/closePosition', () => ({
  closePosition: (...a: any[]) => mockMeteoraClmmClose(...a),
}));

const buildAmm = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { addLiquidityRoute } = await import('../../src/trading/trading-amm-routes/add');
  const { removeLiquidityRoute } = await import('../../src/trading/trading-amm-routes/remove');
  await server.register(addLiquidityRoute);
  await server.register(removeLiquidityRoute);
  return server;
};

const buildClmm = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { closePositionRoute } = await import('../../src/trading/trading-clmm-routes/close');
  await server.register(closePositionRoute);
  return server;
};

describe('write responses name what they acted on', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('AMM — identifiers come from the request', () => {
    let server: any;
    beforeAll(async () => {
      server = await buildAmm();
    });
    afterAll(async () => server.close());

    it('stamps the pool on a fungible-LP add, with no position to name', async () => {
      mockRaydiumAmmAdd.mockResolvedValue(CONFIRMED_ADD);

      const response = await server.inject({
        method: 'POST',
        url: '/add',
        payload: {
          connector: 'raydium',
          chainNetwork: 'solana-mainnet-beta',
          walletAddress: WALLET,
          poolAddress: POOL,
          baseTokenAmount: 1,
          quoteTokenAmount: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.poolAddress).toBe(POOL);
      expect(response.json().data.positionAddress).toBeUndefined();
    });

    // A full removal closes the position account, so it routes through closePosition —
    // hence the close mock on a /remove request.
    it('stamps both on a meteora full removal, whose position the caller named', async () => {
      mockMeteoraAmmClose.mockResolvedValue({
        signature: 'sig',
        status: 1,
        data: { fee: 0.00001, positionRentRefunded: 0.0575, baseTokenAmountRemoved: 1, quoteTokenAmountRemoved: 2 },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          connector: 'meteora',
          chainNetwork: 'solana-mainnet-beta',
          walletAddress: WALLET,
          poolAddress: POOL,
          positionAddress: POSITION,
          percentageToRemove: 100,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({ poolAddress: POOL, positionAddress: POSITION });
    });

    it('does not stamp a pending transaction, which has no confirmed data to describe', async () => {
      mockRaydiumAmmRemove.mockResolvedValue({ signature: 'sig-pending', status: 0 });

      const response = await server.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          connector: 'raydium',
          chainNetwork: 'solana-mainnet-beta',
          walletAddress: WALLET,
          poolAddress: POOL,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ signature: 'sig-pending', status: 0 });
    });
  });

  describe('CLMM — the pool comes from the connector', () => {
    let server: any;
    beforeAll(async () => {
      server = await buildClmm();
    });
    afterAll(async () => server.close());

    const closed = (poolAddress?: string) => ({
      signature: 'sig',
      status: 1,
      data: {
        fee: 0.00001,
        ...(poolAddress ? { poolAddress } : {}),
        positionRentRefunded: 0.002,
        baseTokenAmountRemoved: 1,
        quoteTokenAmountRemoved: 2,
        baseFeeAmountCollected: 0,
        quoteFeeAmountCollected: 0,
      },
    });

    const close = () =>
      server.inject({
        method: 'POST',
        url: '/close',
        payload: {
          connector: 'meteora',
          chainNetwork: 'solana-mainnet-beta',
          walletAddress: WALLET,
          positionAddress: POSITION,
        },
      });

    it('keeps the pool the connector reported and adds the position the caller named', async () => {
      mockMeteoraClmmClose.mockResolvedValue(closed(POOL));

      const response = await close();

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({ poolAddress: POOL, positionAddress: POSITION });
    });

    it('does not invent a pool the connector did not report', async () => {
      // The route never receives a pool, so it has nothing of its own to fall back on.
      mockMeteoraClmmClose.mockResolvedValue(closed());

      const response = await close();

      expect(response.statusCode).toBe(200);
      expect(response.json().data.poolAddress).toBeUndefined();
      expect(response.json().data.positionAddress).toBe(POSITION);
    });

    it('does not stamp a pending close, which has no confirmed data to describe', async () => {
      mockMeteoraClmmClose.mockResolvedValue({ signature: 'sig-pending', status: 0 });

      const response = await close();

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ signature: 'sig-pending', status: 0 });
    });
  });
});

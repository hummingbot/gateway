import { fastifyWithTypeProvider } from '../utils/testUtils';

// Every fund-moving response should name the pool — and, where one exists, the position
// — it acted on, so a stored record identifies its venue without the request that
// produced it. The AMM routes take the pool in the request; the CLMM write routes are
// position-addressed and never receive one, so they resolve it before the write.

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
const mockPositionPool = jest.fn();

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
// Mocked at getPositionPool rather than at the position-info dispatch beneath it:
// the two live in one module, so an intra-module call would bypass the mock.
jest.mock('../../src/trading/clmm/positions', () => ({
  ...jest.requireActual('../../src/trading/clmm/positions'),
  getPositionPool: (...a: any[]) => mockPositionPool(...a),
}));

const buildAmm = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { openPositionRoute } = await import('../../src/trading/trading-amm-routes/open');
  const { closePositionRoute } = await import('../../src/trading/trading-amm-routes/close');
  const { addLiquidityRoute } = await import('../../src/trading/trading-amm-routes/add');
  const { removeLiquidityRoute } = await import('../../src/trading/trading-amm-routes/remove');
  await server.register(openPositionRoute);
  await server.register(closePositionRoute);
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

    it('stamps both on a meteora close, whose position the caller named', async () => {
      mockMeteoraAmmClose.mockResolvedValue({
        signature: 'sig',
        status: 1,
        data: { fee: 0.00001, positionRentRefunded: 0.0575, baseTokenAmountRemoved: 1, quoteTokenAmountRemoved: 2 },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/close',
        payload: {
          connector: 'meteora',
          chainNetwork: 'solana-mainnet-beta',
          walletAddress: WALLET,
          poolAddress: POOL,
          positionAddress: POSITION,
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

  describe('CLMM — the pool is resolved, since the route never receives it', () => {
    let server: any;
    beforeAll(async () => {
      server = await buildClmm();
    });
    afterAll(async () => server.close());

    const closed = {
      signature: 'sig',
      status: 1,
      data: {
        fee: 0.00001,
        positionRentRefunded: 0.002,
        baseTokenAmountRemoved: 1,
        quoteTokenAmountRemoved: 2,
        baseFeeAmountCollected: 0,
        quoteFeeAmountCollected: 0,
      },
    };

    it('resolves the pool before closing, since the position is gone afterwards', async () => {
      mockPositionPool.mockResolvedValue(POOL);
      mockMeteoraClmmClose.mockResolvedValue(closed);

      const response = await server.inject({
        method: 'POST',
        url: '/close',
        payload: {
          connector: 'meteora',
          chainNetwork: 'solana-mainnet-beta',
          walletAddress: WALLET,
          positionAddress: POSITION,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({ poolAddress: POOL, positionAddress: POSITION });
      // Ordering is the point: after the close there is no position left to ask.
      expect(mockPositionPool).toHaveBeenCalled();
      expect(mockPositionPool.mock.invocationCallOrder[0]).toBeLessThan(
        mockMeteoraClmmClose.mock.invocationCallOrder[0],
      );
    });

    it('still closes when the pool cannot be resolved, omitting the field', async () => {
      // getPositionPool swallows its own lookup failure and yields undefined.
      mockPositionPool.mockResolvedValue(undefined);
      mockMeteoraClmmClose.mockResolvedValue(closed);

      const response = await server.inject({
        method: 'POST',
        url: '/close',
        payload: {
          connector: 'meteora',
          chainNetwork: 'solana-mainnet-beta',
          walletAddress: WALLET,
          positionAddress: POSITION,
        },
      });

      // A convenience identifier must never fail the liquidity operation itself.
      expect(response.statusCode).toBe(200);
      expect(mockMeteoraClmmClose).toHaveBeenCalled();
      expect(response.json().data.poolAddress).toBeUndefined();
      expect(response.json().data.positionAddress).toBe(POSITION);
    });
  });
});

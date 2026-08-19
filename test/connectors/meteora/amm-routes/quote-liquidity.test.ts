import BN from 'bn.js';

import { MeteoraDamm } from '../../../../src/connectors/meteora/meteora-damm';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/meteora/meteora-damm');

const mockPoolAddress = 'FH6mP2MUobhDnLERp9z5yv5t2zMUA9WDNXPixpbvYKMv';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteLiquidityRoute } = await import('../../../../src/trading/trading-amm-routes/quote-liquidity');
  await server.register(quoteLiquidityRoute);
  return server;
};

const poolState = {
  sqrtMinPrice: new BN(1),
  sqrtMaxPrice: new BN(2),
  sqrtPrice: new BN(1),
  collectFeeMode: 0,
  tokenAAmount: new BN(0),
  tokenBAmount: new BN(0),
  liquidity: new BN(0),
};

describe('GET /quote-liquidity (Meteora DAMM v2)', () => {
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

  it('quotes a base-limited deposit', async () => {
    // Depositing the base side yields the smaller liquidity delta, so base limits the deposit
    // and the required quote (1.5 USDC) is derived from it.
    const getDepositQuote = jest.fn(({ isTokenA }: { isTokenA: boolean }) =>
      isTokenA
        ? {
            liquidityDelta: new BN(100),
            outputAmount: new BN(1_500_000),
            actualInputAmount: new BN(0),
            consumedInputAmount: new BN(0),
          }
        : {
            liquidityDelta: new BN(200),
            outputAmount: new BN(20_000_000),
            actualInputAmount: new BN(0),
            consumedInputAmount: new BN(0),
          },
    );
    (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue({
      getPoolState: jest.fn().mockResolvedValue(poolState),
      getTokenDecimals: jest.fn().mockResolvedValue({ tokenADecimal: 9, tokenBDecimal: 6 }),
      cpAmm: { getDepositQuote },
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-liquidity',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        poolAddress: mockPoolAddress,
        baseTokenAmount: '0.01',
        quoteTokenAmount: '2',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      baseLimited: true,
      baseTokenAmount: 0.01,
      quoteTokenAmount: 1.5,
      baseTokenAmountMax: 0.01,
      quoteTokenAmountMax: 1.515, // 1.5 * (1 + 1%)
    });
  });
});

import { PoolUtils, TickUtils } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { quotePosition } from '../../../../src/connectors/raydium/clmm-routes/quotePosition';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { QuotePositionResponse } from '../../../../src/schemas/clmm-schema';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana', () => ({ Solana: { getInstance: jest.fn() } }));
jest.mock('../../../../src/connectors/raydium/raydium', () => ({ Raydium: { getInstance: jest.fn() } }));
jest.mock('@raydium-io/raydium-sdk-v2', () => ({
  PoolUtils: { getLiquidityAmountOutFromAmountIn: jest.fn() },
  TickUtils: { getPriceAndTick: jest.fn() },
}));

const sdkQuote = (liquidity: string, amount: number) => ({
  liquidity: new BN(liquidity, 10),
  amountA: { amount: new BN(amount) },
  amountB: { amount: new BN(amount * 2) },
  amountSlippageA: { amount: new BN(amount + 1) },
  amountSlippageB: { amount: new BN(amount * 2 + 1) },
});

describe('Raydium CLMM liquidity precision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      connection: { getEpochInfo: jest.fn().mockResolvedValue({}) },
    });
    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([{ mintA: { decimals: 0 }, mintB: { decimals: 0 } }]),
      getClmmPoolfromRPC: jest.fn().mockResolvedValue({ currentPrice: 2 }),
    });
    (TickUtils.getPriceAndTick as jest.Mock).mockReturnValue({ tick: 1 });
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['9007199254740992', '9007199254740993', true, 10],
    ['9007199254740993', '9007199254740992', false, 20],
    ['9007199254740993', '9007199254740993', false, 20],
  ])('selects the limiting side exactly for base=%s quote=%s', async (base, quote, baseLimited, amount) => {
    (PoolUtils.getLiquidityAmountOutFromAmountIn as jest.Mock)
      .mockResolvedValueOnce(sdkQuote(base, 10))
      .mockResolvedValueOnce(sdkQuote(quote, 20));

    const result = await quotePosition('mainnet-beta', 1, 3, 'pool', 10, 20, 1);

    expect(result).toMatchObject({
      baseLimited,
      liquidity: baseLimited ? base : quote,
      baseTokenAmount: amount,
      quoteTokenAmount: amount * 2,
    });
  });

  it.each([true, false])(
    'preserves decimal liquidity through response serialization (base-only=%s)',
    async (baseOnly) => {
      const liquidity = '18446744073709551615';
      (PoolUtils.getLiquidityAmountOutFromAmountIn as jest.Mock).mockResolvedValue(sdkQuote(liquidity, 10));
      const app = fastifyWithTypeProvider();
      app.get('/quote', { schema: { response: { 200: QuotePositionResponse } } }, () =>
        quotePosition('mainnet-beta', 1, 3, 'pool', baseOnly ? 10 : undefined, baseOnly ? undefined : 20, 1),
      );
      try {
        const response = await app.inject({ method: 'GET', url: '/quote' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ liquidity, baseLimited: baseOnly });
        expect(JSON.stringify(await quotePosition('mainnet-beta', 1, 3, 'pool', 10, undefined, 1))).toContain(
          `"liquidity":"${liquidity}"`,
        );
      } finally {
        await app.close();
      }
    },
  );
});

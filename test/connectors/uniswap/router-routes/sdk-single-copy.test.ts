import { createRequire } from 'module';

import { Trade as RouterTrade } from '@uniswap/router-sdk';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { Pool as V3Pool, Route as V3Route, FeeAmount, TickMath, encodeSqrtRatioX96 } from '@uniswap/v3-sdk';

// smart-order-router quotes with its own dependency tree and hands the trade to
// universal-router-sdk, whose router-sdk checks pools with `instanceof`. That only works
// when every package in the tree resolves to the same copy of the pool classes.
const SOR = '@uniswap/smart-order-router';
const SHARED = ['@uniswap/v3-sdk', '@uniswap/v4-sdk', '@uniswap/router-sdk'];

const sorRequire = createRequire(require.resolve(SOR));
const universalRouterPath = sorRequire.resolve('@uniswap/universal-router-sdk');
const universalRouterRequire = createRequire(universalRouterPath);

describe('Uniswap SDK dependency tree', () => {
  it.each(SHARED)('%s resolves to one copy for gateway, smart-order-router and its universal-router-sdk', (pkg) => {
    expect(sorRequire.resolve(pkg)).toBe(require.resolve(pkg));
    expect(universalRouterRequire.resolve(pkg)).toBe(require.resolve(pkg));
  });

  it('the v4-sdk smart-order-router uses depends on the same v3-sdk', () => {
    const v4Require = createRequire(sorRequire.resolve('@uniswap/v4-sdk'));
    expect(v4Require.resolve('@uniswap/v3-sdk')).toBe(require.resolve('@uniswap/v3-sdk'));
  });

  it('encodes a route of gateway-built V3 pools with the universal-router-sdk smart-order-router uses', async () => {
    const usdc = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC');
    const weth = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH');
    const sqrtPriceX96 = encodeSqrtRatioX96(10 ** 18, 3000 * 10 ** 6);
    const tick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
    const liquidity = '100000000000000000000';
    const pool = new V3Pool(usdc, weth, FeeAmount.MEDIUM, sqrtPriceX96, liquidity, tick, [
      { index: -887220, liquidityNet: liquidity, liquidityGross: liquidity },
      { index: 887220, liquidityNet: `-${liquidity}`, liquidityGross: liquidity },
    ]);
    const route = new V3Route([pool], usdc, weth);
    const trade = await RouterTrade.fromRoute(
      route,
      CurrencyAmount.fromRawAmount(usdc, 1_000_000_000),
      TradeType.EXACT_INPUT,
    );

    const { SwapRouter } = universalRouterRequire('@uniswap/universal-router-sdk');
    const { calldata } = SwapRouter.swapCallParameters(trade, {
      slippageTolerance: new Percent(50, 10_000),
      recipient: '0x0000000000000000000000000000000000000001',
    });
    expect(calldata).toMatch(/^0x[0-9a-f]+$/);
  });
});

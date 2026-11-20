import { Raydium as RaydiumSDK } from '@raydium-io/raydium-sdk-v2';
import { Connection } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { quoteSwap } from '../../../../src/connectors/raydium/amm-routes/quoteSwap';
import { Raydium } from '../../../../src/connectors/raydium/raydium';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');

describe('AMM price impact with the pinned SDK calculations', () => {
  // Construction does not load tokens or make RPC calls; only the pure math is used.
  const sdk = new RaydiumSDK({ connection: new Connection('http://localhost:8899') } as any);
  const addressA = 'So11111111111111111111111111111111111111112';
  const addressB = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it.each([
    [9, 6, false, 'BUY'],
    [9, 6, true, 'BUY'],
    [6, 6, false, 'BUY'],
    [9, 6, false, 'SELL'],
    [9, 6, true, 'SELL'],
  ] as const)('uses comparable price units (%i/%i, reversed=%s, %s)', async (decimalsA, decimalsB, reversed, side) => {
    const mintA = { address: addressA, decimals: decimalsA, symbol: 'A' };
    const mintB = { address: addressB, decimals: decimalsB, symbol: 'B' };
    const base = reversed ? mintB : mintA;
    const quote = reversed ? mintA : mintB;
    const baseReserve = new BN(1000).mul(new BN(10).pow(new BN(decimalsA)));
    const quoteReserve = new BN(2000).mul(new BN(10).pow(new BN(decimalsB)));
    const poolInfo = { mintA, mintB, baseReserve, quoteReserve, version: 4, status: 1 };
    const pool = { baseTokenAddress: addressA, quoteTokenAddress: addressB, poolType: 'amm' };
    const computeIn = jest.fn(sdk.liquidity.computeAmountIn.bind(sdk.liquidity));
    const computeOut = jest.fn(sdk.liquidity.computeAmountOut.bind(sdk.liquidity));
    const raydium = {
      getAmmPoolInfo: jest.fn().mockResolvedValue(pool),
      getPoolfromAPI: jest.fn().mockResolvedValue([poolInfo]),
      raydiumSDK: {
        liquidity: {
          computeAmountIn: computeIn,
          computeAmountOut: computeOut,
          getRpcPoolInfo: jest.fn().mockResolvedValue({ baseReserve, quoteReserve, status: new BN(1) }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(raydium);
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn(async (address) => (address === addressA ? mintA : mintB)),
    });

    const result = await quoteSwap('mainnet-beta', 'pool', base.address, side, 10, 1);
    const raw = side === 'BUY' ? computeIn.mock.results[0].value : computeOut.mock.results[0].value;
    const inputIsA = (side === 'BUY' ? quote.address : base.address) === addressA;
    const reserveIn = inputIsA ? baseReserve : quoteReserve;
    const reserveOut = inputIsA ? quoteReserve : baseReserve;
    // Compute impact from the raw reserve/amount ratio: decimal scaling cancels.
    const inputRaw = new Decimal(result.amountIn).mul(
      new Decimal(10).pow(side === 'BUY' ? quote.decimals : base.decimals),
    );
    const outputRaw = new Decimal(result.amountOut).mul(
      new Decimal(10).pow(side === 'BUY' ? base.decimals : quote.decimals),
    );
    const effectiveInput = side === 'SELL' ? inputRaw.sub(raw.fee.toString()) : inputRaw;
    const expectedPct = new Decimal(1)
      .sub(outputRaw.div(effectiveInput).div(new Decimal(reserveOut.toString()).div(reserveIn.toString())))
      .abs()
      .mul(100)
      .toNumber();

    expect(Number(result.priceImpactPct)).toBeCloseTo(expectedPct, 8);
    expect(Number(result.priceImpactPct)).toBeGreaterThan(0);
    expect(Number(result.priceImpactPct)).toBeLessThan(5);
    if (side === 'BUY') {
      expect(result.amountOut).toBe(10);
      expect(Number(result.maxAmountIn)).toBeGreaterThan(Number(result.amountIn));
    }
  });
});

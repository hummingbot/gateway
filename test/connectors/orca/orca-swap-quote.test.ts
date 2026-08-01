/**
 * Unit tests for getOrcaSwapQuote (v4 whirlpools SDK path).
 *
 * The quote is built via the v4 SDK's `swapInstructions`, which resolves tick
 * arrays, the oracle and Token-2022 extensions internally. This is a
 * regression guard for adaptive-fee whirlpools (fee tier index >= 1024, e.g.
 * CASH/USDC): the legacy whirlpools-core swapQuoteByInputToken /
 * swapQuoteByOutputToken WASM path panics with `unreachable` on those pools
 * even when the oracle account is fetched and supplied.
 */
jest.mock('../../../src/chains/solana/solana');
jest.mock('@orca-so/whirlpools', () => ({
  swapInstructions: jest.fn(),
  setWhirlpoolsConfig: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchWhirlpool: jest.fn(),
  fetchAllPositionWithFilter: jest.fn(),
  positionWhirlpoolFilter: jest.fn(),
}));
jest.mock('@solana-program/token-2022', () => ({
  fetchAllMint: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-core', () => ({
  ...jest.requireActual('@orca-so/whirlpools-core'),
  sqrtPriceToPrice: jest.fn(),
}));

import { swapInstructions, setWhirlpoolsConfig } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { sqrtPriceToPrice } from '@orca-so/whirlpools-core';
import { fetchAllMint } from '@solana-program/token-2022';

import { getOrcaSwapQuote } from '../../../src/connectors/orca/orca.utils';

const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
// Valid base58 32-byte addresses (generated, value irrelevant beyond identity)
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RPC = {} as any;

const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

function mockPool(tokenMintA: string, tokenMintB: string, decimalsA: number, decimalsB: number) {
  (fetchWhirlpool as jest.Mock).mockResolvedValue({
    data: { tokenMintA, tokenMintB, sqrtPrice: 0n },
  });
  (fetchAllMint as jest.Mock).mockResolvedValue([{ data: { decimals: decimalsA } }, { data: { decimals: decimalsB } }]);
}

describe('getOrcaSwapQuote (v4 SDK)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Spot price as tokenB per tokenA in human units (USDC per SOL)
    (sqrtPriceToPrice as jest.Mock).mockReturnValue(64.0);
    mockPool(SOL_MINT, USDC_MINT, SOL_DECIMALS, USDC_DECIMALS);
  });

  describe('SELL (exact input of base token)', () => {
    beforeEach(() => {
      (swapInstructions as jest.Mock).mockResolvedValue({
        quote: {
          tokenIn: 1_000_000_000n, // 1 SOL
          tokenEstOut: 63_900_000n, // 63.9 USDC
          tokenMinOut: 63_261_000n, // 63.261 USDC after 1% slippage
        },
      });
    });

    it('passes an exact-in request for the base mint to swapInstructions', async () => {
      await getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'SELL', 1);

      expect(swapInstructions).toHaveBeenCalledTimes(1);
      const [, params, pool, slippageBps] = (swapInstructions as jest.Mock).mock.calls[0];
      expect(params).toEqual({ inputAmount: 1_000_000_000n, mint: SOL_MINT });
      expect(String(pool)).toBe(POOL);
      expect(slippageBps).toBe(100);
    });

    it('returns amounts, quote/base price, and min/max from the quote', async () => {
      const q = await getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'SELL', 1);

      expect(q.inputAmount).toBeCloseTo(1);
      expect(q.outputAmount).toBeCloseTo(63.9);
      // price is quote-per-base regardless of side
      expect(q.price).toBeCloseTo(63.9);
      expect(q.minOutputAmount).toBeCloseTo(63.261);
      expect(q.maxInputAmount).toBeCloseTo(1);
      // |spot 64 - exec 63.9| / 64 = 0.15625%
      expect(q.priceImpactPct).toBeCloseTo(0.15625);
      expect(q.inputToken).toBe(SOL_MINT);
      expect(q.outputToken).toBe(USDC_MINT);
    });
  });

  describe('BUY (exact output of base token)', () => {
    beforeEach(() => {
      (swapInstructions as jest.Mock).mockResolvedValue({
        quote: {
          tokenEstIn: 64_100_000n, // 64.1 USDC
          tokenOut: 1_000_000_000n, // 1 SOL
          tokenMaxIn: 64_741_000n, // 64.741 USDC after 1% slippage
        },
      });
    });

    it('passes an exact-out request for the base mint to swapInstructions', async () => {
      await getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'BUY', 1);

      const [, params] = (swapInstructions as jest.Mock).mock.calls[0];
      expect(params).toEqual({ outputAmount: 1_000_000_000n, mint: SOL_MINT });
    });

    it('returns amounts in input/output orientation with quote/base price', async () => {
      const q = await getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'BUY', 1);

      expect(q.inputAmount).toBeCloseTo(64.1);
      expect(q.outputAmount).toBeCloseTo(1);
      // price stays quote-per-base on BUY too (NOT base/quote)
      expect(q.price).toBeCloseTo(64.1);
      expect(q.maxInputAmount).toBeCloseTo(64.741);
      expect(q.minOutputAmount).toBeCloseTo(1);
      expect(q.inputToken).toBe(USDC_MINT);
      expect(q.outputToken).toBe(SOL_MINT);
    });
  });

  describe('base token is whirlpool tokenB', () => {
    it('inverts the spot rate so price impact stays in quote/base units', async () => {
      // Pool stores USDC as tokenA and SOL as tokenB; SOL is still our base.
      mockPool(USDC_MINT, SOL_MINT, USDC_DECIMALS, SOL_DECIMALS);
      // sqrtPriceToPrice returns tokenB/tokenA = SOL per USDC
      (sqrtPriceToPrice as jest.Mock).mockReturnValue(1 / 64.0);
      (swapInstructions as jest.Mock).mockResolvedValue({
        quote: {
          tokenIn: 1_000_000_000n, // 1 SOL
          tokenEstOut: 63_900_000n, // 63.9 USDC
          tokenMinOut: 63_261_000n,
        },
      });

      const q = await getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'SELL', 1);

      expect(q.price).toBeCloseTo(63.9);
      // Same impact as the tokenA-base case: spot is inverted to 64 USDC/SOL
      expect(q.priceImpactPct).toBeCloseTo(0.15625);
    });
  });

  describe('network handling', () => {
    beforeEach(() => {
      (swapInstructions as jest.Mock).mockResolvedValue({
        quote: { tokenIn: 1_000_000_000n, tokenEstOut: 63_900_000n, tokenMinOut: 63_261_000n },
      });
    });

    it('configures the v4 SDK for mainnet by default', async () => {
      await getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'SELL', 1);
      expect(setWhirlpoolsConfig).toHaveBeenCalledWith('solanaMainnet');
    });

    it('configures the v4 SDK for devnet when requested', async () => {
      await getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'SELL', 1, 'devnet');
      expect(setWhirlpoolsConfig).toHaveBeenCalledWith('solanaDevnet');
    });
  });

  it('throws when the whirlpool does not exist', async () => {
    (fetchWhirlpool as jest.Mock).mockResolvedValue({ data: null });
    await expect(getOrcaSwapQuote(RPC, POOL, SOL_MINT, USDC_MINT, 1, 'SELL', 1)).rejects.toThrow(
      `Whirlpool not found: ${POOL}`,
    );
  });
});

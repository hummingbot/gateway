import { approximateBuyViaSellLeg, RouterToken } from '../../src/connectors/router-utils';

const SOL: RouterToken = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const USDC: RouterToken = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };

describe('approximateBuyViaSellLeg', () => {
  it('derives the forward ExactIn quote from the sell leg output', async () => {
    // Buying 2 SOL with USDC at ~150 USDC/SOL
    const getExactInQuote = jest.fn().mockImplementation(async (inputToken, outputToken, amountRaw) => {
      if (inputToken.symbol === 'SOL') {
        // Sell leg: 2 SOL -> 300 USDC
        expect(amountRaw).toBe((2e9).toString());
        return { inAmount: amountRaw, outAmount: (300e6).toString(), quote: { leg: 'sell' } };
      }
      // Forward leg: 300 USDC -> ~1.99 SOL
      expect(inputToken.symbol).toBe('USDC');
      expect(outputToken.symbol).toBe('SOL');
      expect(amountRaw).toBe((300e6).toString());
      return { inAmount: amountRaw, outAmount: (1.99e9).toString(), quote: { leg: 'forward' } };
    });

    const result = await approximateBuyViaSellLeg({
      getExactInQuote,
      baseToken: SOL,
      quoteToken: USDC,
      baseAmount: 2,
    });

    expect(getExactInQuote).toHaveBeenCalledTimes(2);
    expect(result.quoteAmountInRaw).toBe((300e6).toString());
    expect(result.quoteAmountIn).toBeCloseTo(300);
    expect(result.estimatedBaseOut).toBeCloseTo(1.99);
    expect(result.forwardQuote.quote).toEqual({ leg: 'forward' });
  });

  it('floors the raw sell-leg amount to an integer of smallest units', async () => {
    const getExactInQuote = jest.fn().mockImplementation(async (inputToken, _outputToken, amountRaw) => {
      if (inputToken.symbol === 'SOL') {
        expect(amountRaw).toBe(Math.floor(0.123456789123 * 1e9).toString());
        return { inAmount: amountRaw, outAmount: '1000000', quote: {} };
      }
      return { inAmount: amountRaw, outAmount: '123000000', quote: {} };
    });

    await approximateBuyViaSellLeg({ getExactInQuote, baseToken: SOL, quoteToken: USDC, baseAmount: 0.123456789123 });
    expect(getExactInQuote).toHaveBeenCalledTimes(2);
  });

  it('sends the raw sell-leg amount in plain digits when it reaches 1e21', async () => {
    // a thousand of an 18-decimal token; the old conversion produced "1e+21" here
    const WETH: RouterToken = { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 };
    const getExactInQuote = jest
      .fn()
      .mockResolvedValueOnce({ inAmount: '1000000000000000000000', outAmount: '3000000000000', quote: {} })
      .mockResolvedValueOnce({ inAmount: '3000000000000', outAmount: '999000000000000000000', quote: {} });

    await approximateBuyViaSellLeg({ getExactInQuote, baseToken: WETH, quoteToken: USDC, baseAmount: 1000 });

    expect(getExactInQuote.mock.calls[0][2]).toBe('1000000000000000000000');
  });

  it('throws a clear error when the sell leg returns no output', async () => {
    const getExactInQuote = jest.fn().mockResolvedValue({ inAmount: '1', outAmount: '0', quote: {} });

    await expect(
      approximateBuyViaSellLeg({ getExactInQuote, baseToken: SOL, quoteToken: USDC, baseAmount: 1 }),
    ).rejects.toThrow(/sell-leg quote.*returned no output/);
    expect(getExactInQuote).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when the forward leg returns no output', async () => {
    const getExactInQuote = jest
      .fn()
      .mockResolvedValueOnce({ inAmount: '1000000000', outAmount: '150000000', quote: {} })
      .mockResolvedValueOnce({ inAmount: '150000000', outAmount: '0', quote: {} });

    await expect(
      approximateBuyViaSellLeg({ getExactInQuote, baseToken: SOL, quoteToken: USDC, baseAmount: 1 }),
    ).rejects.toThrow(/forward quote.*returned no output/);
  });

  it('propagates router errors from the quote callback', async () => {
    const getExactInQuote = jest.fn().mockRejectedValue(new Error('No route found for this token pair'));

    await expect(
      approximateBuyViaSellLeg({ getExactInQuote, baseToken: SOL, quoteToken: USDC, baseAmount: 1 }),
    ).rejects.toThrow('No route found for this token pair');
  });
});

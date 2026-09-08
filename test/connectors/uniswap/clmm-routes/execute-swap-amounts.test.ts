import { BigNumber, utils } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { executeClmmSwap } from '../../../../src/connectors/uniswap/clmm-routes/executeSwap';
import { getUniswapClmmQuote, resolveCounterToken } from '../../../../src/connectors/uniswap/clmm-routes/quoteSwap';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('../../../../src/connectors/uniswap/clmm-routes/quoteSwap');
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return { ...actual, Contract: jest.fn() };
});

// A CLMM swap reports the amounts it moved. Those must come from the receipt, not from the
// quote: the quote is taken before the transaction lands, so the two diverge exactly when the
// pool moves under the trade or the trade is sandwiched — the cases a caller most needs to
// see. Reporting the estimate makes a bad fill indistinguishable from a clean one.
//
// Amounts below are a real mainnet fill (USDM1/USDC, block 25934155) that was sandwiched: the
// quote said 1321.771489 USDC and the pool actually took 1323.079017.

const POOL = '0x6f161ad0e297ecb9d1b33c048272ccc964cb4b6a';
const USDC = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' };
const USDM1 = { address: '0x90a1717e0dabe37693f79afe43ae236dc3b65957', decimals: 18, symbol: 'USDM1' };
const WALLET = '0x4c0001c6a45e53593c1d5771bf3707546555f310';
const TX_HASH = '0x55ae8e75cf4068137e4292402fd293da6556b2efc46c9ebb26adc76189dca1cc';

const QUOTED_IN = 1321.771489; // what the quote predicted
const ACTUAL_IN = 1323.079017; // what the pool actually took
const AMOUNT_OUT = 1300;

const SWAP_TOPIC = utils.id('Swap(address,address,int256,int256,uint160,uint128,int24)');

/** Uniswap V3 `Swap` log for this pool: amount0 negative (USDM1 out), amount1 positive (USDC in). */
const swapLog = (poolAddress = POOL) => ({
  address: poolAddress,
  topics: [SWAP_TOPIC, `0x${'0'.repeat(64)}`, `0x${'0'.repeat(64)}`],
  data: utils.defaultAbiCoder.encode(
    ['int256', 'int256', 'uint160', 'uint128', 'int24'],
    [
      utils.parseUnits(String(AMOUNT_OUT), USDM1.decimals).mul(-1),
      utils.parseUnits(String(ACTUAL_IN), USDC.decimals),
      BigNumber.from('79925750843517301750109'),
      BigNumber.from('37262968407461730368'),
      -276149,
    ],
  ),
});

const primeMocks = (logs: any[]) => {
  (Uniswap.getInstance as jest.Mock).mockResolvedValue({});
  (resolveCounterToken as jest.Mock).mockResolvedValue('USDC');
  (getUniswapClmmQuote as jest.Mock).mockResolvedValue({
    quote: {
      inputToken: USDC,
      outputToken: USDM1,
      feeTier: 100,
      estimatedAmountIn: QUOTED_IN,
      estimatedAmountOut: AMOUNT_OUT,
      rawAmountIn: utils.parseUnits(String(QUOTED_IN), USDC.decimals).toString(),
      rawAmountOut: utils.parseUnits(String(AMOUNT_OUT), USDM1.decimals).toString(),
      rawMaxAmountIn: utils.parseUnits('1323.09326', USDC.decimals).toString(),
      rawMinAmountOut: utils.parseUnits(String(AMOUNT_OUT), USDM1.decimals).toString(),
    },
  });

  const { Contract } = require('ethers');
  (Contract as jest.Mock).mockImplementation(() => ({
    // Allowance is unlimited so the route reaches the swap.
    allowance: jest.fn().mockResolvedValue(utils.parseUnits('1000000000', USDC.decimals)),
    exactOutputSingle: jest.fn().mockResolvedValue({ hash: TX_HASH }),
    exactInputSingle: jest.fn().mockResolvedValue({ hash: TX_HASH }),
  }));

  (Ethereum.getInstance as jest.Mock).mockResolvedValue({
    init: jest.fn().mockResolvedValue(undefined),
    provider: {},
    isHardwareWallet: jest.fn().mockResolvedValue(false),
    getWallet: jest.fn().mockResolvedValue({ address: WALLET }),
    getContract: jest.fn(() => ({
      allowance: jest.fn().mockResolvedValue(utils.parseUnits('1000000000', USDC.decimals)),
    })),
    prepareGasOptions: jest.fn().mockResolvedValue({}),
    handleTransactionConfirmation: jest.fn().mockResolvedValue({
      confirmed: true,
      signature: TX_HASH,
      fee: 0.0000218,
      receipt: { gasUsed: BigNumber.from(138639), logs },
    }),
  });
};

describe('uniswap clmm execute-swap reported amounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports what the pool actually moved, not what the quote predicted', async () => {
    primeMocks([swapLog()]);

    const result = await executeClmmSwap('mainnet', WALLET, POOL, 'USDM1', 'BUY', AMOUNT_OUT, 0.02);

    expect(result.data.amountIn).toBeCloseTo(ACTUAL_IN, 6);
    expect(result.data.amountIn).not.toBeCloseTo(QUOTED_IN, 6);
    expect(result.data.amountOut).toBeCloseTo(AMOUNT_OUT, 6);
  });

  it('derives balance changes from the executed amounts', async () => {
    primeMocks([swapLog()]);

    const result = await executeClmmSwap('mainnet', WALLET, POOL, 'USDM1', 'BUY', AMOUNT_OUT, 0.02);

    // BUY: base in, quote out. The quote-side change is the real cost, so a sandwiched
    // fill shows up in P&L instead of being papered over by the estimate.
    expect(result.data.baseTokenBalanceChange).toBeCloseTo(AMOUNT_OUT, 6);
    expect(result.data.quoteTokenBalanceChange).toBeCloseTo(-ACTUAL_IN, 6);
  });

  it('ignores Swap events from other pools in the same transaction', async () => {
    // A router may touch several pools; only this pool's leg describes this trade.
    primeMocks([swapLog('0x1111111111111111111111111111111111111111'), swapLog()]);

    const result = await executeClmmSwap('mainnet', WALLET, POOL, 'USDM1', 'BUY', AMOUNT_OUT, 0.02);

    expect(result.data.amountIn).toBeCloseTo(ACTUAL_IN, 6);
  });

  it('falls back to quoted amounts when the pool emitted no Swap event', async () => {
    // Should not happen for a settled single-pool swap, but a confirmed transaction must
    // still return its hash rather than throwing the fill away.
    primeMocks([]);

    const result = await executeClmmSwap('mainnet', WALLET, POOL, 'USDM1', 'BUY', AMOUNT_OUT, 0.02);

    expect(result.signature).toBe(TX_HASH);
    expect(result.data.amountIn).toBeCloseTo(QUOTED_IN, 6);
  });
});

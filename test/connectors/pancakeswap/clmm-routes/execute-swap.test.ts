/**
 * execute-swap.test.ts
 *
 * Regression tests for the sqrtPriceLimitX96 BigInt conversion fix in executeSwap.ts.
 * The bug: passing executionPrice numerator/denominator (JSBI values from PancakeSwap SDK)
 * to @uniswap/v3-sdk's encodeSqrtRatioX96 caused a cross-SDK JSBI type mismatch,
 * manifesting as "Cannot convert X to BigInt". The fix sets sqrtPriceLimitX96 to 0
 * (no price limit; slippage is enforced via amountOutMinimum / amountInMaximum instead).
 */

import { executeClmmSwap } from '../../../../src/connectors/pancakeswap/clmm-routes/executeSwap';

// ─── Mock dependencies ───────────────────────────────────────────────────────

const MOCK_RECEIPT = {
  transactionHash: '0xabc123',
  status: 1,
  gasUsed: { toString: () => '150000', mul: (_: any) => ({ toString: () => '900000000000000' }) },
  effectiveGasPrice: {},
};

const makeMockQuote = (_side: 'BUY' | 'SELL') => ({
  rawAmountIn: '200000000000000000',
  rawAmountOut: '10000000',
  rawMinAmountOut: '9900000',
  rawMaxAmountIn: '202000000000000000',
  estimatedAmountIn: 0.2,
  estimatedAmountOut: 10,
  feeTier: 500,
  inputToken: { address: '0xTokenIn', symbol: 'WBNB', decimals: 18 },
  outputToken: { address: '0xTokenOut', symbol: 'USDT', decimals: 6 },
  trade: {
    executionPrice: {
      numerator: { toString: () => '10000000' },
      denominator: { toString: () => '200000000000000000' },
    },
  },
});

jest.mock('../../../../src/connectors/pancakeswap/clmm-routes/quoteSwap', () => ({
  getPancakeswapClmmQuote: jest
    .fn()
    .mockImplementation((_n, _p, _b, _q, _a, side) => Promise.resolve({ quote: makeMockQuote(side) })),
}));

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap', () => ({
  Pancakeswap: {
    getInstance: jest.fn().mockResolvedValue({
      findDefaultPool: jest.fn().mockResolvedValue('0xPool'),
    }),
  },
}));

const mockTx = { hash: '0xTxHash' };

const mockExactInputSingle = jest.fn().mockResolvedValue(mockTx);
const mockExactOutputSingle = jest.fn().mockResolvedValue(mockTx);
const mockAllowance = jest.fn().mockResolvedValue('99999999999999999999');

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({
      exactInputSingle: mockExactInputSingle,
      exactOutputSingle: mockExactOutputSingle,
      allowance: mockAllowance,
    })),
  };
});

jest.mock('../../../../src/chains/ethereum/ethereum', () => ({
  Ethereum: {
    getInstance: jest.fn().mockResolvedValue({
      init: jest.fn(),
      ready: jest.fn().mockReturnValue(true),
      chainId: 56,
      provider: {},
      isHardwareWallet: jest.fn().mockResolvedValue(false),
      getWallet: jest.fn().mockResolvedValue({}),
      getContract: jest.fn().mockReturnValue({ allowance: jest.fn().mockResolvedValue('99999999999999999999') }),
      prepareGasOptions: jest.fn().mockResolvedValue({ gasLimit: 350000 }),
      handleTransactionExecution: jest.fn().mockResolvedValue({
        transactionHash: '0xabc123',
        status: 1,
        gasUsed: { toString: () => '150000', mul: (_: any) => ({ toString: () => '900000000000000' }) },
        effectiveGasPrice: {},
      }),
    }),
  },
}));

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.config', () => ({
  PancakeswapConfig: { config: { slippagePct: 1 }, networks: ['bsc', 'mainnet', 'arbitrum', 'base'] },
}));

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.contracts', () => ({
  getPancakeswapV3SwapRouter02Address: jest.fn().mockReturnValue('0xRouter'),
  ISwapRouter02ABI: [],
}));

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.utils', () => ({
  formatTokenAmount: jest.fn().mockImplementation((raw: string) => parseFloat(raw) / 1e18),
}));

jest.mock('../../../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/error-handler', () => ({
  httpErrors: {
    notFound: (msg: string) => Object.assign(new Error(msg), { statusCode: 404 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { statusCode: 400 }),
    internalServerError: (msg: string) => Object.assign(new Error(msg), { statusCode: 500 }),
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('executeClmmSwap — sqrtPriceLimitX96 BigInt fix', () => {
  beforeEach(() => jest.clearAllMocks());

  it('executes a SELL with decimal amount (0.2) without BigInt conversion error', async () => {
    const result = await executeClmmSwap('0xWallet', 'bsc', 'WBNB', 'USDT', 0.2, 'SELL', 1);

    expect(result.signature).toBe('0xabc123');
    expect(result.status).toBe(1);
    expect(mockExactInputSingle).toHaveBeenCalledTimes(1);

    // Verify sqrtPriceLimitX96 is 0 (no cross-SDK BigInt conversion)
    const callArgs = mockExactInputSingle.mock.calls[0][0];
    expect(callArgs.sqrtPriceLimitX96).toBe(0);
  });

  it('executes a BUY with decimal amount (0.2) without BigInt conversion error', async () => {
    const result = await executeClmmSwap('0xWallet', 'bsc', 'WBNB', 'USDT', 0.2, 'BUY', 1);

    expect(result.signature).toBe('0xabc123');
    expect(result.status).toBe(1);
    expect(mockExactOutputSingle).toHaveBeenCalledTimes(1);

    const callArgs = mockExactOutputSingle.mock.calls[0][0];
    expect(callArgs.sqrtPriceLimitX96).toBe(0);
  });

  it('passes raw string amounts directly to contract (no wrapping)', async () => {
    await executeClmmSwap('0xWallet', 'bsc', 'WBNB', 'USDT', 0.2, 'SELL', 1);

    const callArgs = mockExactInputSingle.mock.calls[0][0];
    expect(callArgs.amountIn).toBe('200000000000000000');
    expect(callArgs.amountOutMinimum).toBe('9900000');
  });
});

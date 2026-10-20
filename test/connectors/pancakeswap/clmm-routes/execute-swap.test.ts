import { Price, Token } from '@pancakeswap/swap-sdk-core';
import { BigNumber, utils } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { executeClmmSwap } from '../../../../src/connectors/pancakeswap/clmm-routes/executeSwap';
import {
  getPancakeswapClmmQuote,
  resolveCounterToken,
} from '../../../../src/connectors/pancakeswap/clmm-routes/quoteSwap';
import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');
jest.mock('../../../../src/connectors/pancakeswap/clmm-routes/quoteSwap');
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return { ...actual, Contract: jest.fn() };
});

// Issue #713: a PancakeSwap CLMM swap failed before it was sent, with
// "Cannot convert 999429662315995114 to a BigInt". The route encoded the quote's execution
// price with the Uniswap SDK's JSBI encoder, but a PancakeSwap Price holds native bigints.
// The values below are the WBNB/USDT pool and the numerator from the issue.

const POOL = '0x172fcD41E0913e95784454622d1c3724f546f849';
const WALLET = '0x628010E5B0c4dC04CAF498312486841630f8b567';
const TX_HASH = '0x' + 'ab'.repeat(32);
const WBNB = new Token(56, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 18, 'WBNB');
const USDT = new Token(56, '0x55d398326f99059fF775485246999027B3197955', 18, 'USDT');

const RAW_IN = utils.parseUnits('0.00127146709074549', 18).toString();
const RAW_OUT = '999429662315995114';

let router: { exactInputSingle: jest.Mock; exactOutputSingle: jest.Mock };

const primeMocks = () => {
  (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({});
  (resolveCounterToken as jest.Mock).mockResolvedValue('USDT');
  (getPancakeswapClmmQuote as jest.Mock).mockResolvedValue({
    quote: {
      inputToken: { address: WBNB.address, symbol: 'WBNB', decimals: 18 },
      outputToken: { address: USDT.address, symbol: 'USDT', decimals: 18 },
      feeTier: 100,
      // A real PancakeSwap SDK price: its numerator and denominator are native bigints.
      trade: { executionPrice: new Price(WBNB, USDT, BigInt(RAW_IN), BigInt(RAW_OUT)) },
      estimatedAmountIn: 0.00127146709074549,
      estimatedAmountOut: 0.9994296623159951,
      rawAmountIn: RAW_IN,
      rawAmountOut: RAW_OUT,
      rawMinAmountOut: '994432514004415138',
      rawMaxAmountIn: '1277824426529221',
    },
  });

  router = {
    exactInputSingle: jest.fn().mockResolvedValue({ hash: TX_HASH }),
    exactOutputSingle: jest.fn().mockResolvedValue({ hash: TX_HASH }),
  };
  const { Contract } = require('ethers');
  (Contract as jest.Mock).mockImplementation(() => router);

  (Ethereum.getInstance as jest.Mock).mockResolvedValue({
    init: jest.fn().mockResolvedValue(undefined),
    provider: {},
    isHardwareWallet: jest.fn().mockResolvedValue(false),
    getWallet: jest.fn().mockResolvedValue({ address: WALLET }),
    getContract: jest.fn(() => ({
      allowance: jest.fn().mockResolvedValue(utils.parseUnits('1000', 18)),
    })),
    prepareGasOptions: jest.fn().mockResolvedValue({}),
    handleTransactionConfirmation: jest.fn().mockResolvedValue({
      confirmed: true,
      signature: TX_HASH,
      fee: 0.00001,
      receipt: { gasUsed: BigNumber.from(120000), logs: [] },
    }),
  });
};

describe('pancakeswap clmm execute-swap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeMocks();
  });

  it('sends a SELL with no price limit', async () => {
    const result = await executeClmmSwap('bsc', WALLET, POOL, 'WBNB', 'SELL', 0.00127146709074549, 0.5);

    expect(result.signature).toBe(TX_HASH);
    const [params] = router.exactInputSingle.mock.calls[0];
    expect(params.amountIn).toBe(RAW_IN);
    expect(params.amountOutMinimum).toBe('994432514004415138');
    expect(params.sqrtPriceLimitX96).toBe('0');
  });

  it('sends a BUY with no price limit', async () => {
    const result = await executeClmmSwap('bsc', WALLET, POOL, 'USDT', 'BUY', 0.9994296623159951, 0.5);

    expect(result.signature).toBe(TX_HASH);
    const [params] = router.exactOutputSingle.mock.calls[0];
    expect(params.amountOut).toBe(RAW_OUT);
    expect(params.amountInMaximum).toBe('1277824426529221');
    expect(params.sqrtPriceLimitX96).toBe('0');
  });
});

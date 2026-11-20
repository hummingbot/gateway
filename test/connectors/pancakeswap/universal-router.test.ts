import { Token, CurrencyAmount, TradeType, Percent } from '@pancakeswap/sdk';
import { PoolType } from '@pancakeswap/smart-router';
import { computePairAddress } from '@pancakeswap/v2-sdk';
import { BigNumber, Contract } from 'ethers';

import { UniversalRouterService } from '../../../src/connectors/pancakeswap/universal-router';

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    Contract: jest.fn(),
  };
});

const WBNB = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WBNB', 'Wrapped Ether');
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin');
// PancakeSwap's V2 factory on Ethereum mainnet; the pair lives at the address it derives.
const V2_PAIR = computePairAddress({
  factoryAddress: '0x1097053Fd2ea711dad45caCcc45EfF7548fCB362',
  tokenA: WBNB,
  tokenB: USDC,
});

const quoteOptions = (protocols: PoolType[]) => ({
  slippageTolerance: new Percent(1, 100),
  deadline: Math.floor(Date.now() / 1000) + 1800,
  recipient: '0x0000000000000000000000000000000000000001',
  protocols,
});

// Every pool read reverts, as a call to an address with no contract does.
const noContract = () => Promise.reject(new Error('call revert exception'));
const emptyAddress = () => ({
  getReserves: jest.fn(noContract),
  token0: jest.fn(noContract),
  liquidity: jest.fn(noContract),
  slot0: jest.fn(noContract),
});

describe('UniversalRouterService (pancakeswap)', () => {
  let universalRouter: UniversalRouterService;

  beforeEach(() => {
    (Contract as unknown as jest.Mock).mockReset();
    // The smart router prices gas while ranking routes.
    const provider = { getGasPrice: jest.fn().mockResolvedValue(BigNumber.from('20000000000')) };
    universalRouter = new UniversalRouterService(provider as any, 1, 'mainnet');
  });

  it('quotes a V2 swap from the reserves of the pair at its factory address', async () => {
    // 1,000 WBNB against 3,000,000 USDC; only the direct pair exists. 1 WBNB in, 0.25% fee:
    // 1e18·9975·3e12 / (1e21·10000 + 1e18·9975) = 2989517955 raw USDC.
    (Contract as unknown as jest.Mock).mockImplementation((address: string) =>
      address === V2_PAIR
        ? {
            getReserves: jest
              .fn()
              .mockResolvedValue([BigNumber.from('1000000000000000000000'), BigNumber.from('3000000000000'), 0]),
            token0: jest.fn().mockResolvedValue(WBNB.address),
          }
        : emptyAddress(),
    );

    const amount = CurrencyAmount.fromRawAmount(WBNB, '1000000000000000000');
    const quote = await universalRouter.getQuote(
      WBNB,
      USDC,
      amount,
      TradeType.EXACT_INPUT,
      quoteOptions([PoolType.V2]),
    );

    expect(quote.quote.quotient.toString()).toBe('2989517955');
    expect(quote.methodParameters.to).toBe('0x13f4EA83D0bd40E75C8222255bc855a974568Dd4');
  });

  it('reports no route when no V2 pair or V3 pool exists', async () => {
    (Contract as unknown as jest.Mock).mockImplementation(emptyAddress);

    const amount = CurrencyAmount.fromRawAmount(WBNB, '1000000000000000000');
    await expect(
      universalRouter.getQuote(WBNB, USDC, amount, TradeType.EXACT_INPUT, quoteOptions([PoolType.V2, PoolType.V3])),
    ).rejects.toThrow('No routes found for WBNB -> USDC');
  });
});

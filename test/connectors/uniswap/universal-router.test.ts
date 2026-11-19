import { Protocol } from '@uniswap/router-sdk';
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import { BigNumber, Contract } from 'ethers';

import { UniversalRouterService } from '../../../src/connectors/uniswap/universal-router';

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    Contract: jest.fn(),
  };
});

const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH', 'Wrapped Ether');
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin');
// The canonical Uniswap V2 WETH/USDC pair, which the service must derive from the factory.
const WETH_USDC_V2_PAIR = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc';

const quoteOptions = (protocols: Protocol[]) => ({
  slippageTolerance: new Percent(1, 100),
  deadline: Math.floor(Date.now() / 1000) + 1800,
  recipient: '0x0000000000000000000000000000000000000001',
  protocols,
});

describe('UniversalRouterService (uniswap)', () => {
  let universalRouter: UniversalRouterService;

  beforeEach(() => {
    (Contract as unknown as jest.Mock).mockReset();
    universalRouter = new UniversalRouterService({} as any, 1, 'mainnet');
  });

  it('quotes a V2 swap from the pair reserves at its factory address', async () => {
    // 1,000 WETH against 3,000,000 USDC. 1 WETH in, 0.3% fee:
    // 1e18·997·3e12 / (1e21·1000 + 1e18·997) = 2988020943 raw USDC.
    (Contract as unknown as jest.Mock).mockImplementation(() => ({
      getReserves: jest
        .fn()
        .mockResolvedValue([BigNumber.from('1000000000000000000000'), BigNumber.from('3000000000000'), 0]),
      token0: jest.fn().mockResolvedValue(WETH.address),
    }));

    const amount = CurrencyAmount.fromRawAmount(WETH, '1000000000000000000');
    const quote = await universalRouter.getQuote(
      WETH,
      USDC,
      amount,
      TradeType.EXACT_INPUT,
      quoteOptions([Protocol.V2]),
    );

    expect((Contract as unknown as jest.Mock).mock.calls[0][0]).toBe(WETH_USDC_V2_PAIR);
    expect(quote.quote.quotient.toString()).toBe('2988020943');
    expect(quote.methodParameters.to).toBe('0x66a9893cc07d91d95644aedd05d03f95e1dba8af');
  });

  it('reports no route when no V2 pair or V3 pool exists', async () => {
    // Every pool read reverts, as a call to an address with no contract does.
    const noContract = () => Promise.reject(new Error('call revert exception'));
    (Contract as unknown as jest.Mock).mockImplementation(() => ({
      getReserves: jest.fn(noContract),
      token0: jest.fn(noContract),
      liquidity: jest.fn(noContract),
      slot0: jest.fn(noContract),
    }));

    const amount = CurrencyAmount.fromRawAmount(WETH, '1000000000000000000');
    await expect(
      universalRouter.getQuote(WETH, USDC, amount, TradeType.EXACT_INPUT, quoteOptions([Protocol.V2, Protocol.V3])),
    ).rejects.toThrow('No routes found for WETH -> USDC');
  });
});

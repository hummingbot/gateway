jest.useFakeTimers();
import {
  Fetcher,
  Pair,
  Percent,
  Route,
  Token,
  CurrencyAmount,
  Trade,
  TradeType,
  Currency,
} from '@pancakeswap/sdk';
import { BigNumber } from 'ethers';
import { BinanceSmartChain } from '../../../src/chains/binance-smart-chain/binance-smart-chain';
import { PancakeSwap } from '../../../src/connectors/pancakeswap/pancakeswap';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { patch, unpatch } from '../../../test/services/patch';

let bsc: BinanceSmartChain;
let pancakeswap: PancakeSwap;

const WBNB = new Token(
  56,
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  18,
  'WBNB'
);
const DAI = new Token(
  56,
  '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
  18,
  'DAI'
);

beforeAll(async () => {
  bsc = BinanceSmartChain.getInstance('mainnet');
  patchEVMNonceManager(bsc.nonceManager);
  await bsc.init();
  pancakeswap = PancakeSwap.getInstance('binance-smart-chain', 'mainnet');
  await pancakeswap.init();
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await bsc.close();
});

const patchFetchPairData = () => {
  patch(Fetcher, 'fetchPairData', () => {
    return new Pair(
      CurrencyAmount.fromRawAmount(WBNB, '2000000000000000000'),
      CurrencyAmount.fromRawAmount(DAI, '1000000000000000000')
    );
  });
};

const patchTrade = (key: string, error?: Error) => {
  patch(Trade, key, () => {
    if (error) return [];
    const WBNB_DAI = new Pair(
      CurrencyAmount.fromRawAmount(WBNB, '2000000000000000000'),
      CurrencyAmount.fromRawAmount(DAI, '1000000000000000000')
    );
    const DAI_TO_WBNB = new Route<Token, Currency>([WBNB_DAI], DAI, WBNB);
    return [
      new Trade(
        DAI_TO_WBNB,
        CurrencyAmount.fromRawAmount(DAI, '1000000000000000'),
        TradeType.EXACT_INPUT
      ),
    ];
  });
};

describe('verify PancakeSwap estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactIn');

    const expectedTrade = await pancakeswap.estimateSellTrade(
      WBNB,
      DAI,
      BigNumber.from(1)
    );

    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactIn', new Error('error getting trade'));

    await expect(async () => {
      await pancakeswap.estimateSellTrade(WBNB, DAI, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify PancakeSwap estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactOut');

    const expectedTrade = await pancakeswap.estimateBuyTrade(
      WBNB,
      DAI,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactOut', new Error('error getting trade'));

    await expect(async () => {
      await pancakeswap.estimateBuyTrade(WBNB, DAI, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('getAllowedSlippage', () => {
  it('return value of string when not null', () => {
    const allowedSlippage = pancakeswap.getAllowedSlippage('3/100');
    expect(allowedSlippage).toEqual(new Percent('3', '100'));
  });

  it('return value from config when string is null', () => {
    const allowedSlippage = pancakeswap.getAllowedSlippage();
    expect(allowedSlippage).toEqual(new Percent('1', '100'));
  });

  it('return value from config when string is malformed', () => {
    const allowedSlippage = pancakeswap.getAllowedSlippage('yo');
    expect(allowedSlippage).toEqual(new Percent('1', '100'));
  });
});

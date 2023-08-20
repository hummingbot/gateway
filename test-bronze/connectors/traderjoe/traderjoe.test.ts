jest.useFakeTimers();
import { Traderjoe } from '../../../src/connectors/traderjoe/traderjoe';
import { patch, unpatch } from '../../services/patch';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import {
  Pair,
  Percent,
  Route,
  Token,
  TokenAmount,
  Trade,
  TradeType,
} from '@traderjoe-xyz/sdk';
import { BigNumber } from 'ethers';
import { Avalanche } from '../../../src/chains/avalanche/avalanche';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { JSBI, TradeV2 } from '@traderjoe-xyz/sdk-v2';
let avalanche: Avalanche;
let traderjoe: Traderjoe;

const EUROC = new Token(
  43114,
  '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
  6,
  'EUROC'
);
const USDC = new Token(
  43114,
  '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  18,
  'USDC'
);
const TRADE_DATA = [
  {
    quote: {
      route: [
        '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
        '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      ],
      pairs: ['0xe6C7E4142b0cB24F2bFa7b9a50911375f8EE8DB9'],
      binSteps: [JSBI.BigInt('5')],
      versions: [2],
      amounts: [JSBI.BigInt('1000000'), JSBI.BigInt('1073560')],
      virtualAmountsWithoutSlippage: [
        JSBI.BigInt('1000000'),
        JSBI.BigInt('1073560'),
      ],
      fees: [JSBI.BigInt('501000000000000')],
    },
    route: {
      pairs: [
        {
          token0: {
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin',
            isNative: false,
            isToken: true,
            chainId: 43114,
            address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
          },
          token1: {
            decimals: 6,
            symbol: 'EUROC',
            name: 'Euro Coin',
            isNative: false,
            isToken: true,
            chainId: 43114,
            address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
          },
        },
      ],
      path: [
        {
          decimals: 6,
          symbol: 'EUROC',
          name: 'Euro Coin',
          isNative: false,
          isToken: true,
          chainId: 43114,
          address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
        },
        {
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
          isNative: false,
          isToken: true,
          chainId: 43114,
          address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        },
      ],
      input: {
        decimals: 6,
        symbol: 'EUROC',
        name: 'Euro Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
      },
      output: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
    },
    tradeType: 0,
    inputAmount: new TokenAmount(EUROC, JSBI.BigInt('1000000')),
    outputAmount: new TokenAmount(USDC, JSBI.BigInt('1073560')),
    executionPrice: {
      numerator: [1073560],
      denominator: [1000000],
      baseCurrency: {
        decimals: 6,
        symbol: 'EUROC',
        name: 'Euro Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
      },
      quoteCurrency: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
      scalar: {
        numerator: [1000000],
        denominator: [1000000],
      },
    },
    exactQuote: {
      numerator: [1073560],
      denominator: [1000000],
      currency: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
      token: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
    },
    priceImpact: {
      numerator: [],
      denominator: [891917824, 999],
    },
    isNativeIn: false,
    isNativeOut: false,
    toLog() {
      console.log('BEST TRADE');
    },
    maximumAmountIn() {
      return '1';
    },
    minimumAmountOut() {
      return '1.073560';
    },
  },
  {
    quote: {
      route: [
        '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
        '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
        '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      ],
      pairs: [
        '0x2fc25db3c7d63b765187Be4aFaB47625f2eafAa5',
        '0xD446eb1660F766d533BeCeEf890Df7A69d26f7d1',
      ],
      binSteps: [JSBI.BigInt('20'), JSBI.BigInt('20')],
      versions: [2, 2],
      amounts: [
        JSBI.BigInt('1000000'),
        JSBI.BigInt('76528983999645888'),
        JSBI.BigInt('1072380'),
      ],
      virtualAmountsWithoutSlippage: [
        JSBI.BigInt('1000000'),
        JSBI.BigInt('76528983999645888'),
        JSBI.BigInt('1072380'),
      ],
      fees: [JSBI.BigInt('2008000000000000'), JSBI.BigInt('2033133056080006')],
    },
    route: {
      pairs: [
        {
          token0: {
            decimals: 18,
            symbol: 'WAVAX',
            name: 'Wrapped AVAX',
            isNative: false,
            isToken: true,
            chainId: 43114,
            address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
          },
          token1: {
            decimals: 6,
            symbol: 'EUROC',
            name: 'Euro Coin',
            isNative: false,
            isToken: true,
            chainId: 43114,
            address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
          },
        },
        {
          token0: {
            decimals: 18,
            symbol: 'WAVAX',
            name: 'Wrapped AVAX',
            isNative: false,
            isToken: true,
            chainId: 43114,
            address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
          },
          token1: {
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin',
            isNative: false,
            isToken: true,
            chainId: 43114,
            address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
          },
        },
      ],
      path: [
        {
          decimals: 6,
          symbol: 'EUROC',
          name: 'Euro Coin',
          isNative: false,
          isToken: true,
          chainId: 43114,
          address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
        },
        {
          decimals: 18,
          symbol: 'WAVAX',
          name: 'Wrapped AVAX',
          isNative: false,
          isToken: true,
          chainId: 43114,
          address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
        },
        {
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
          isNative: false,
          isToken: true,
          chainId: 43114,
          address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        },
      ],
      input: {
        decimals: 6,
        symbol: 'EUROC',
        name: 'Euro Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
      },
      output: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
    },
    tradeType: 0,
    inputAmount: new TokenAmount(EUROC, JSBI.BigInt('1000000')),
    outputAmount: new TokenAmount(USDC, JSBI.BigInt('1073560')),
    executionPrice: {
      numerator: [1072380],
      denominator: [1000000],
      baseCurrency: {
        decimals: 6,
        symbol: 'EUROC',
        name: 'Euro Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
      },
      quoteCurrency: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
      scalar: {
        numerator: [1000000],
        denominator: [1000000],
      },
    },
    exactQuote: {
      numerator: [1072380],
      denominator: [1000000],
      currency: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
      token: {
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isNative: false,
        isToken: true,
        chainId: 43114,
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      },
    },
    priceImpact: {
      numerator: [],
      denominator: [785659648, 998],
    },
    isNativeIn: false,
    isNativeOut: false,
    toLog() {
      console.log('BEST TRADE');
    },
    maximumAmountIn() {
      return '1';
    },
    minimumAmountOut() {
      return '1.073560';
    },
  },
];

beforeAll(async () => {
  avalanche = Avalanche.getInstance('fuji');
  patchEVMNonceManager(avalanche.nonceManager);
  await avalanche.init();

  traderjoe = Traderjoe.getInstance('avalanche', 'fuji');
  await traderjoe.init();
});

beforeEach(() => {
  patchEVMNonceManager(avalanche.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await avalanche.close();
});

const patchGetTradesData = (error?: boolean) => {
  patch(TradeV2, 'getTradesExactIn', () => {
    return error === true ? [] : TRADE_DATA;
  });
  patch(TradeV2, 'getTradesExactOut', () => {
    return error === true ? [] : TRADE_DATA;
  });
};

const patchTrade = (key: string, error?: Error) => {
  patch(Trade, key, () => {
    if (error) return [];
    const WETH_WAVAX = new Pair(
      new TokenAmount(EUROC, '2000000000000000000'),
      new TokenAmount(USDC, '1000000000000000000'),
      43114
    );
    const WAVAX_TO_WETH = new Route([WETH_WAVAX], USDC);
    return [
      new Trade(
        WAVAX_TO_WETH,
        new TokenAmount(USDC, '1000000000000000'),
        TradeType.EXACT_INPUT,
        43114
      ),
    ];
  });
};

describe('verify Traderjoe estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchGetTradesData();
    patchTrade('bestTradeExactIn');

    const expectedTrade = await traderjoe.estimateSellTrade(
      EUROC,
      USDC,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    patchGetTradesData(true);

    await expect(async () => {
      await traderjoe.estimateSellTrade(EUROC, USDC, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify Traderjoe estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchGetTradesData();
    patchTrade('bestTradeExactOut');

    const expectedTrade = await traderjoe.estimateBuyTrade(
      EUROC,
      USDC,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    patchGetTradesData(true);
    patchTrade('bestTradeExactOut', new Error('error getting trade'));

    await expect(async () => {
      await traderjoe.estimateBuyTrade(EUROC, USDC, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('getAllowedSlippage', () => {
  it('return value of string when not null', () => {
    const allowedSlippage = traderjoe.getAllowedSlippage('3/100');
    expect(allowedSlippage).toEqual(new Percent('3', '100'));
  });

  it('return value from config when string is null', () => {
    const allowedSlippage = traderjoe.getAllowedSlippage();
    expect(allowedSlippage).toEqual(new Percent('1', '100'));
  });

  it('return value from config when string is malformed', () => {
    const allowedSlippage = traderjoe.getAllowedSlippage('yo');
    expect(allowedSlippage).toEqual(new Percent('1', '100'));
  });
});

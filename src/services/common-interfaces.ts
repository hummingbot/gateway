import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core';

export interface Uniswapish {
  ready(): boolean;
}

export interface UniswapishTrade {
  // Common trade properties needed for route files
  executionPrice: {
    toFixed: (val: number) => string;
    invert: () => {
      toFixed: (val: number) => string;
    };
  };
  minimumAmountOut: (arg0: any) => CurrencyAmount<Currency>;
  maximumAmountIn: (arg0: any) => CurrencyAmount<Currency>;
  inputAmount: CurrencyAmount<Currency>;
  outputAmount: CurrencyAmount<Currency>;
  tradeType: TradeType;
}

export interface ExpectedTrade {
  trade: UniswapishTrade;
  expectedAmount: CurrencyAmount<Currency>;
}
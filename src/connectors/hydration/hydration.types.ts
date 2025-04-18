import { TokenInfo } from '../../chains/ethereum/ethereum-base';

export interface HydrationPoolInfo {
  id: string;
  poolAddress: string;
  baseToken: {
    address: string;
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
  };
  quoteToken: {
    address: string;
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
  };
  fee: number;
  liquidity: number;
  sqrtPrice: string;
  tick: number;
  price: number;
  volume24h: number;
  volumeWeek: number;
  tvl: number;
  feesUSD24h: number;
  apr: number;
  type: string;
  baseTokenAmount: number;
  quoteTokenAmount: number;
}

export interface SwapQuote {
  estimatedAmountIn: number;
  estimatedAmountOut: number;
  minAmountOut: number;
  maxAmountIn: number;
  baseTokenBalanceChange: number;
  quoteTokenBalanceChange: number;
  price: number;
  route: SwapRoute[];
  fee: number;
  gasPrice: number;
  gasLimit: number;
  gasCost: number;
}

export interface SwapRoute {
  poolAddress: string;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  percentage: number;
}

export enum PositionStrategyType {
  Balanced = 0,
  BaseHeavy = 1,
  QuoteHeavy = 2,
  Imbalanced = 3,
  Custom = 4
}

export interface LiquidityQuote {
  baseTokenAmount: number;
  quoteTokenAmount: number;
  lowerPrice: number;
  upperPrice: number;
  liquidity: number;
}

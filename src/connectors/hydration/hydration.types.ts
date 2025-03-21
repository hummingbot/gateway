import { TokenInfo } from '../../chains/ethereum/ethereum-base';

export interface HydrationPoolInfo {
  id: string;
  poolAddress: string;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
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
}

export interface BinLiquidity {
  lowerPrice: number;
  upperPrice: number;
  liquidityAmount: number;
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
  priceImpact: number;
  route: SwapRoute[];
}

export interface SwapRoute {
  poolAddress: string;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  percentage: number;
}

export interface SwapExecutionResult {
  signature: string;
  totalInputSwapped: number;
  totalOutputSwapped: number;
  fee: number;
  baseTokenBalanceChange: number;
  quoteTokenBalanceChange: number;
  priceImpact: number;
}

export interface PositionInfo {
  positionAddress: string;
  ownerAddress: string;
  poolAddress: string;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  lowerPrice: number;
  upperPrice: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseFeeAmount: number;
  quoteFeeAmount: number;
  liquidity: number;
  inRange: boolean;
  createdAt: number;
  apr: number;
}

export interface OpenPositionResult {
  signature: string;
  fee: number;
  positionAddress: string;
  positionRent: number;
  baseTokenAmountAdded: number;
  quoteTokenAmountAdded: number;
}

export interface AddLiquidityResult {
  signature: string;
  baseTokenAmountAdded: number;
  quoteTokenAmountAdded: number;
  fee: number;
}

export interface RemoveLiquidityResult {
  signature: string;
  fee: number;
  baseTokenAmountRemoved: number;
  quoteTokenAmountRemoved: number;
}

export interface CollectFeesResult {
  signature: string;
  fee: number;
  baseFeeAmountCollected: number;
  quoteFeeAmountCollected: number;
}

export interface ClosePositionResult {
  signature: string;
  fee: number;
  positionRentRefunded: number;
  baseTokenAmountRemoved: number;
  quoteTokenAmountRemoved: number;
  baseFeeAmountCollected: number;
  quoteFeeAmountCollected: number;
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

export interface TokenBalance {
  token: TokenInfo;
  balance: number;
}

export interface PoolFeeInfo {
  fee: number;
  feeDescription: string;
  protocolFee: number;
  isV3: boolean;
}

export interface PoolSnapshot {
  timestamp: number;
  liquidity: number;
  sqrtPrice: string;
  tick: number;
  volume: number;
  fees: number;
  tvl: number;
}

export interface RouteInfo {
  path: TokenInfo[];
  pools: string[];
  inputAmount: number;
  outputAmount: number;
  percentage: number;
}

export interface FeeStrategyParams {
  feeTier: number;
  description: string;
  tickSpacing: number;
}

export interface HydrationFeeStrategy {
  id: number;
  params: FeeStrategyParams;
}


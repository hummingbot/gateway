export interface BaseClmmParams {
    network: string;
    poolAddress?: string;
    walletAddress?: string;
}
export interface FetchPoolsParams extends BaseClmmParams {
    limit?: number;
    tokenA?: string;
    tokenB?: string;
}
export interface PoolSummary {
    publicKey: string;
    tokenX: string;
    tokenY: string;
    binStep: number;
    price: number;
}
export interface FetchPoolsResult {
    pools: PoolSummary[];
}
export interface PoolInfoParams extends BaseClmmParams {
    poolAddress: string;
}
export interface BinLiquidity {
    binId: number;
    price: number;
    baseTokenAmount: number;
    quoteTokenAmount: number;
}
export interface PoolInfoResult {
    address: string;
    baseTokenAddress: string;
    quoteTokenAddress: string;
    binStep: number;
    feePct: number;
    dynamicFeePct: number;
    price: number;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    activeBinId: number;
    minBinId: number;
    maxBinId: number;
    bins: BinLiquidity[];
}
export interface PositionsOwnedParams extends BaseClmmParams {
    walletAddress: string;
    poolAddress?: string;
}
export interface PositionSummary {
    address: string;
    poolAddress: string;
    lowerBinId: number;
    upperBinId: number;
}
export interface PositionsOwnedResult {
    positions: PositionSummary[];
}
export interface PositionInfoParams extends BaseClmmParams {
    positionAddress: string;
    walletAddress?: string;
}
export interface PositionInfoResult {
    address: string;
    poolAddress: string;
    baseTokenAddress: string;
    quoteTokenAddress: string;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    baseFeeAmount: number;
    quoteFeeAmount: number;
    lowerBinId: number;
    upperBinId: number;
    lowerPrice: number;
    upperPrice: number;
    price: number;
}
export interface QuotePositionParams extends BaseClmmParams {
    poolAddress: string;
    lowerPrice: number;
    upperPrice: number;
    baseTokenAmount?: number;
    quoteTokenAmount?: number;
}
export interface QuotePositionResult {
    baseTokenAmount: number;
    quoteTokenAmount: number;
    lowerBinId: number;
    upperBinId: number;
    binDistribution: BinLiquidity[];
}
export interface QuoteSwapParams extends BaseClmmParams {
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    amountIn?: number;
    amountOut?: number;
    slippagePct?: number;
}
export interface QuoteSwapResult {
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    price: number;
    priceImpactPct: number;
    minAmountOut: number;
    maxAmountIn: number;
    feePct: number;
}
export interface OpenPositionParams extends BaseClmmParams {
    walletAddress: string;
    poolAddress: string;
    lowerPrice: number;
    upperPrice: number;
    baseTokenAmount?: number;
    quoteTokenAmount?: number;
    slippagePct?: number;
    strategyType?: number;
}
export interface OpenPositionResult {
    signature: string;
    status: number;
    data?: {
        fee: number;
        positionAddress: string;
        positionRent: number;
        baseTokenAmountAdded: number;
        quoteTokenAmountAdded: number;
    };
}
export interface ClosePositionParams extends BaseClmmParams {
    walletAddress: string;
    positionAddress: string;
}
export interface ClosePositionResult {
    signature: string;
    status: number;
    data?: {
        fee: number;
        baseTokenAmountRemoved: number;
        quoteTokenAmountRemoved: number;
        baseFeesClaimed: number;
        quoteFeesClaimed: number;
        rentReclaimed: number;
    };
}
export interface AddLiquidityParams extends BaseClmmParams {
    walletAddress: string;
    positionAddress: string;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    slippagePct?: number;
}
export interface AddLiquidityResult {
    signature: string;
    status: number;
    data?: {
        fee: number;
        baseTokenAmountAdded: number;
        quoteTokenAmountAdded: number;
    };
}
export interface RemoveLiquidityParams extends BaseClmmParams {
    walletAddress: string;
    positionAddress: string;
    percentageToRemove: number;
}
export interface RemoveLiquidityResult {
    signature: string;
    status: number;
    data?: {
        fee: number;
        baseTokenAmountRemoved: number;
        quoteTokenAmountRemoved: number;
    };
}
export interface CollectFeesParams extends BaseClmmParams {
    walletAddress: string;
    positionAddress: string;
}
export interface CollectFeesResult {
    signature: string;
    status: number;
    data?: {
        fee: number;
        baseFeesClaimed: number;
        quoteFeesClaimed: number;
    };
}
export interface ExecuteSwapParams extends BaseClmmParams {
    walletAddress: string;
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    amountIn?: number;
    amountOut?: number;
    slippagePct?: number;
}
export interface ExecuteSwapResult {
    signature: string;
    status: number;
    data?: {
        amountIn: number;
        amountOut: number;
        fee: number;
        tokenIn: string;
        tokenOut: string;
    };
}

export interface BaseClmmParams {
    network: string;
    poolAddress: string;
    walletAddress?: string;
}
export interface OpenPositionParams extends BaseClmmParams {
    walletAddress: string;
    lowerPrice: number;
    upperPrice: number;
    baseTokenAmount?: number;
    quoteTokenAmount?: number;
    baseTokenSymbol?: string;
    quoteTokenSymbol?: string;
    slippagePct?: number;
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
        positionRentReclaimed: number;
        baseTokenAmountRemoved: number;
        quoteTokenAmountRemoved: number;
        feesCollected: {
            base: number;
            quote: number;
        };
    };
}
export interface AddLiquidityParams extends BaseClmmParams {
    walletAddress: string;
    positionAddress: string;
    baseTokenAmount?: number;
    quoteTokenAmount?: number;
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
        baseTokenFeesCollected: number;
        quoteTokenFeesCollected: number;
    };
}
export interface PositionsOwnedParams {
    network: string;
    walletAddress: string;
    poolAddress: string;
}
export type PositionsOwnedResult = PositionInfoResult[];
export interface PositionInfoParams {
    network: string;
    positionAddress: string;
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
export interface PoolInfoParams {
    network: string;
    poolAddress: string;
}
export interface PoolInfoResult {
    address: string;
    baseTokenAddress: string;
    quoteTokenAddress: string;
    binStep: number;
    feePct: number;
    price: number;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    activeBinId: number;
}
export interface QuotePositionParams extends BaseClmmParams {
    lowerPrice: number;
    upperPrice: number;
    baseTokenAmount?: number;
    quoteTokenAmount?: number;
    slippagePct?: number;
}
export interface QuotePositionResult {
    baseLimited: boolean;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    baseTokenAmountMax: number;
    quoteTokenAmountMax: number;
    tickLower: number;
    tickUpper: number;
    liquidity: string;
    estimatedApr?: number;
}
export interface QuoteSwapParams extends BaseClmmParams {
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
    slippagePct: number;
    minAmountOut: number;
    maxAmountIn: number;
    priceImpact: number;
    priceImpactPct: number;
    fee?: number;
    ticksBefore?: number[];
    ticksAfter?: number[];
}
export interface ExecuteSwapParams extends BaseClmmParams {
    walletAddress: string;
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
        fee: number;
        amountIn: number;
        amountOut: number;
        priceImpact: number;
    };
}
export interface TickInfo {
    tick: number;
    price: number;
    liquidityNet: string;
    liquidityGross: string;
}
export interface PositionData {
    nftMint: string;
    poolId: string;
    tickLower: number;
    tickUpper: number;
    liquidity: string;
    feeGrowthInsideLastX64A: string;
    feeGrowthInsideLastX64B: string;
    tokenFeesOwedA: string;
    tokenFeesOwedB: string;
    rewardInfos: Array<{
        rewardGrowthInsideLastX64: string;
        rewardAmountOwed: string;
    }>;
}

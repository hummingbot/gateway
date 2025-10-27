export type PoolType = 'amm' | 'cpmm';
export interface BaseAmmParams {
    network: string;
    poolAddress: string;
    walletAddress?: string;
}
export interface AddLiquidityParams extends BaseAmmParams {
    walletAddress: string;
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
export interface RemoveLiquidityParams extends BaseAmmParams {
    walletAddress: string;
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
export interface QuoteLiquidityParams extends BaseAmmParams {
    baseTokenAmount?: number;
    quoteTokenAmount?: number;
    slippagePct?: number;
}
export interface QuoteLiquidityResult {
    baseLimited: boolean;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    baseTokenAmountMax: number;
    quoteTokenAmountMax: number;
}
export interface QuoteSwapParams extends BaseAmmParams {
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
    priceImpactPct: number;
}
export interface ExecuteSwapParams extends BaseAmmParams {
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
export interface PoolInfoParams {
    network: string;
    poolAddress: string;
}
export interface PoolInfoResult {
    poolAddress: string;
    poolType: PoolType;
    baseToken: {
        address: string;
        symbol: string;
        decimals: number;
    };
    quoteToken: {
        address: string;
        symbol: string;
        decimals: number;
    };
    lpToken: {
        address: string;
        supply: string;
    };
    reserves: {
        base: string;
        quote: string;
    };
    price: {
        base: number;
        quote: number;
    };
    volume24h?: number;
    tvl?: number;
    fee?: number;
}
export interface PositionInfoParams {
    network: string;
    walletAddress: string;
    poolAddress: string;
}
export interface PositionInfoResult {
    poolAddress: string;
    walletAddress: string;
    baseTokenAddress: string;
    quoteTokenAddress: string;
    lpTokenAmount: number;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    price: number;
}
export interface TokenBurnInfo {
    amount: string;
    mint: string;
    tokenAccount: string;
}
export interface TokenReceiveInfo {
    amount: string;
    mint: string;
    tokenAccount: string;
}
export interface AmmComputePairResult {
    anotherAmount: {
        numerator: string;
        denominator: string;
        token: {
            symbol: string;
            address: string;
            decimals: number;
        };
    };
    maxAnotherAmount: {
        numerator: string;
        denominator: string;
        token: {
            symbol: string;
            address: string;
            decimals: number;
        };
    };
    liquidity: string;
}
export interface CpmmComputePairResult {
    anotherAmount: {
        amount: string;
    };
    maxAnotherAmount: {
        amount: string;
    };
    liquidity: string;
    inputAmountFee: {
        amount: string;
    };
}

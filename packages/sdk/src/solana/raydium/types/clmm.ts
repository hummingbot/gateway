/**
 * Raydium CLMM Operation Types
 *
 * Type definitions for all CLMM (Concentrated Liquidity Market Maker) operations.
 * CLMM provides concentrated liquidity with price ranges similar to Uniswap V3.
 */

/**
 * Base operation parameters (common to all CLMM operations)
 */
export interface BaseClmmParams {
  /** Network (mainnet-beta, devnet) */
  network: string;

  /** Pool address */
  poolAddress: string;

  /** Wallet address (for transaction operations) */
  walletAddress?: string;
}

// ============================================================================
// OPEN POSITION
// ============================================================================

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

// ============================================================================
// CLOSE POSITION
// ============================================================================

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

// ============================================================================
// ADD LIQUIDITY (to existing position)
// ============================================================================

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

// ============================================================================
// REMOVE LIQUIDITY (from existing position)
// ============================================================================

export interface RemoveLiquidityParams extends BaseClmmParams {
  walletAddress: string;
  positionAddress: string;
  percentageToRemove: number; // 0-100
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

// ============================================================================
// COLLECT FEES
// ============================================================================

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

// ============================================================================
// POSITIONS OWNED
// ============================================================================

export interface PositionsOwnedParams {
  network: string;
  walletAddress: string;
  poolAddress: string; // Pool address to filter positions
}

// The API returns an array of PositionInfoResult
// (Importing PositionInfoResult type defined below)
export type PositionsOwnedResult = PositionInfoResult[];

// ============================================================================
// POSITION INFO
// ============================================================================

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
  lowerBinId: number;     // Note: For Raydium CLMM, this is tickLower
  upperBinId: number;     // Note: For Raydium CLMM, this is tickUpper
  lowerPrice: number;
  upperPrice: number;
  price: number;
}

// ============================================================================
// POOL INFO
// ============================================================================

export interface PoolInfoParams {
  network: string;
  poolAddress: string;
}

export interface PoolInfoResult {
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  binStep: number;        // Note: For Raydium CLMM, this is tickSpacing
  feePct: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  activeBinId: number;    // Note: For Raydium CLMM, this is tickCurrent
}

// ============================================================================
// QUOTE POSITION
// ============================================================================

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

// ============================================================================
// QUOTE SWAP
// ============================================================================

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

// ============================================================================
// EXECUTE SWAP
// ============================================================================

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

// ============================================================================
// INTERNAL TYPES (for SDK implementation)
// ============================================================================

/**
 * Tick info
 */
export interface TickInfo {
  tick: number;
  price: number;
  liquidityNet: string;
  liquidityGross: string;
}

/**
 * Position data (from on-chain account)
 */
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

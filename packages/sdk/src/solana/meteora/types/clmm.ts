/**
 * Meteora DLMM (Dynamic Liquidity Market Maker) Operation Types
 *
 * Type definitions for all Meteora CLMM operations.
 * Meteora uses a bin-based liquidity model similar to concentrated liquidity.
 */

/**
 * Base operation parameters (common to all Meteora operations)
 */
export interface BaseClmmParams {
  /** Network (mainnet-beta, devnet) */
  network: string;

  /** Pool address */
  poolAddress?: string;

  /** Wallet address (for transaction operations) */
  walletAddress?: string;
}

// ============================================================================
// FETCH POOLS
// ============================================================================

export interface FetchPoolsParams extends BaseClmmParams {
  /** Maximum number of pools to return */
  limit?: number;

  /** First token symbol or address (optional filter) */
  tokenA?: string;

  /** Second token symbol or address (optional filter) */
  tokenB?: string;
}

export interface PoolSummary {
  /** Pool public key */
  publicKey: string;

  /** Token X (base) mint address */
  tokenX: string;

  /** Token Y (quote) mint address */
  tokenY: string;

  /** Bin step size */
  binStep: number;

  /** Current price */
  price: number;
}

export interface FetchPoolsResult {
  pools: PoolSummary[];
}

// ============================================================================
// POOL INFO
// ============================================================================

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

// ============================================================================
// POSITIONS OWNED
// ============================================================================

export interface PositionsOwnedParams extends BaseClmmParams {
  walletAddress: string;
  poolAddress?: string; // Optional filter for specific pool
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

// ============================================================================
// POSITION INFO
// ============================================================================

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

// ============================================================================
// QUOTE POSITION
// ============================================================================

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

// ============================================================================
// QUOTE SWAP
// ============================================================================

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

// ============================================================================
// OPEN POSITION
// ============================================================================

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
  status: number; // 1 = confirmed, 0 = pending, -1 = failed
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
    baseTokenAmountRemoved: number;
    quoteTokenAmountRemoved: number;
    baseFeesClaimed: number;
    quoteFeesClaimed: number;
    rentReclaimed: number;
  };
}

// ============================================================================
// ADD LIQUIDITY
// ============================================================================

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

// ============================================================================
// REMOVE LIQUIDITY
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
    baseFeesClaimed: number;
    quoteFeesClaimed: number;
  };
}

// ============================================================================
// EXECUTE SWAP
// ============================================================================

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

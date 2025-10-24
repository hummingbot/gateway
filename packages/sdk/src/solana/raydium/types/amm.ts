/**
 * Raydium AMM Operation Types
 *
 * Type definitions for all AMM (Automated Market Maker) operations.
 * Includes both standard AMM and CPMM (Constant Product Market Maker) pool types.
 */

/**
 * Pool Types
 */
export type PoolType = 'amm' | 'cpmm';

/**
 * Base operation parameters (common to all AMM operations)
 */
export interface BaseAmmParams {
  /** Network (mainnet-beta, devnet) */
  network: string;

  /** Pool address */
  poolAddress: string;

  /** Wallet address (for transaction operations) */
  walletAddress?: string;
}

// ============================================================================
// ADD LIQUIDITY
// ============================================================================

export interface AddLiquidityParams extends BaseAmmParams {
  walletAddress: string;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  slippagePct?: number;
}

export interface AddLiquidityResult {
  signature: string;
  status: number; // 1 = confirmed, 0 = pending
  data?: {
    fee: number;
    baseTokenAmountAdded: number;
    quoteTokenAmountAdded: number;
  };
}

// ============================================================================
// REMOVE LIQUIDITY
// ============================================================================

export interface RemoveLiquidityParams extends BaseAmmParams {
  walletAddress: string;
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
// QUOTE LIQUIDITY
// ============================================================================

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

// ============================================================================
// QUOTE SWAP
// ============================================================================

export interface QuoteSwapParams extends BaseAmmParams {
  tokenIn: string;  // Token address
  tokenOut: string; // Token address
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

// ============================================================================
// EXECUTE SWAP
// ============================================================================

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

// ============================================================================
// POOL INFO
// ============================================================================

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

// ============================================================================
// POSITION INFO
// ============================================================================

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

// ============================================================================
// INTERNAL TYPES (for SDK implementation)
// ============================================================================

/**
 * Token burn info (for remove liquidity)
 */
export interface TokenBurnInfo {
  amount: string; // BN string
  mint: string;
  tokenAccount: string;
}

/**
 * Token receive info (for remove liquidity)
 */
export interface TokenReceiveInfo {
  amount: string; // BN string
  mint: string;
  tokenAccount: string;
}

/**
 * AMM compute pair result (for quote operations)
 */
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
  liquidity: string; // BN string
}

/**
 * CPMM compute pair result (for quote operations)
 */
export interface CpmmComputePairResult {
  anotherAmount: {
    amount: string; // BN string
  };
  maxAnotherAmount: {
    amount: string; // BN string
  };
  liquidity: string; // BN string
  inputAmountFee: {
    amount: string; // BN string
  };
}

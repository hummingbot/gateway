import { TokenInfo } from '../../chains/ethereum/ethereum-base';

/**
 * Represents a pool in the Hydration protocol with detailed information.
 * Contains all necessary data about a liquidity pool including tokens, pricing, and metrics.
 */
export interface HydrationPoolInfo {
  /** Unique identifier for the pool */
  id: string;
  
  /** The pool's contract address */
  poolAddress: string;
  
  /** The first token in the pair */
  baseToken: {
    /** Contract address of the token */
    address: string;
    
    /** Symbol representing the token (e.g., DOT) */
    symbol: string;
    
    /** Number of decimal places for the token */
    decimals: number;
    
    /** Human-readable name of the token */
    name: string;
    
    /** Chain ID where the token exists */
    chainId: number;
  };
  
  /** The second token in the pair */
  quoteToken: {
    /** Contract address of the token */
    address: string;
    
    /** Symbol representing the token (e.g., USDT) */
    symbol: string;
    
    /** Number of decimal places for the token */
    decimals: number;
    
    /** Human-readable name of the token */
    name: string;
    
    /** Chain ID where the token exists */
    chainId: number;
  };
  
  /** Pool fee percentage */
  fee: number;
  
  /** Current pool liquidity */
  liquidity: number;
  
  /** Square root price used in some AMM calculations */
  sqrtPrice: string;
  
  /** Current tick in concentrated liquidity positions */
  tick: number;
  
  /** Current price of base token in terms of quote token */
  price: number;
  
  /** 24-hour trading volume */
  volume24h: number;
  
  /** Weekly trading volume */
  volumeWeek: number;
  
  /** Total value locked in the pool */
  tvl: number;
  
  /** Fees collected in USD over 24 hours */
  feesUSD24h: number;
  
  /** Annual percentage rate (yield) */
  apr: number;
  
  /** Type of pool (e.g., 'xyk', 'lbp', 'omnipool') */
  type: string;
  
  /** Amount of base token in the pool */
  baseTokenAmount: number;
  
  /** Amount of quote token in the pool */
  quoteTokenAmount: number;
}

/**
 * Represents a swap quote with estimated values and route information.
 * Contains all the information needed for executing a token swap.
 */
export interface SwapQuote {
  /** Estimated amount of input token */
  estimatedAmountIn: number;
  
  /** Estimated amount of output token */
  estimatedAmountOut: number;
  
  /** Minimum amount of output token accounting for slippage */
  minAmountOut: number;
  
  /** Maximum amount of input token accounting for slippage */
  maxAmountIn: number;
  
  /** Net change in base token balance */
  baseTokenBalanceChange: number;
  
  /** Net change in quote token balance */
  quoteTokenBalanceChange: number;
  
  /** Exchange rate */
  price: number;
  
  /** Routing path for the swap */
  route: SwapRoute[];
  
  /** Fee amount for the swap */
  fee: number;
  
  /** Current gas price */
  gasPrice: number;
  
  /** Gas limit for the transaction */
  gasLimit: number;
  
  /** Cost of gas for the transaction */
  gasCost: number;
}

/**
 * Represents a segment in a swap route.
 * Each segment specifies a pool that will be used for part of the swap.
 */
export interface SwapRoute {
  /** Address of the pool used for this route segment */
  poolAddress: string;
  
  /** Base token information */
  baseToken: TokenInfo;
  
  /** Quote token information */
  quoteToken: TokenInfo;
  
  /** Percentage of the total swap amount routed through this pool */
  percentage: number;
}

/**
 * Defines the possible position strategies for providing liquidity.
 * Determines how tokens are distributed when adding liquidity.
 */
export enum PositionStrategyType {
  /** Equal distribution of both tokens */
  Balanced = 0,
  
  /** Favor the base token */
  BaseHeavy = 1,
  
  /** Favor the quote token */
  QuoteHeavy = 2,
  
  /** Uneven distribution */
  Imbalanced = 3,
  
  /** User-defined distribution */
  Custom = 4
}

/**
 * Quote for adding liquidity to a pool.
 * Contains information about token amounts and price ranges.
 */
export interface LiquidityQuote {
  /** Amount of base token to add */
  baseTokenAmount: number;
  
  /** Amount of quote token to add */
  quoteTokenAmount: number;
  
  /** Lower price boundary for concentrated liquidity */
  lowerPrice: number;
  
  /** Upper price boundary for concentrated liquidity */
  upperPrice: number;
  
  /** Liquidity amount calculated */
  liquidity: number;
}

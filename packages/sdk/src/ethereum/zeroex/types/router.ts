/**
 * 0x Router Operation Types
 *
 * Type definitions for all 0x router (DEX aggregator) operations.
 */

/**
 * Base 0x configuration
 */
export interface ZeroXConfig {
  /** Ethereum network */
  network: string;
  /** Chain ID */
  chainId: number;
  /** API key for 0x API */
  apiKey: string;
  /** API endpoint URL */
  apiEndpoint: string;
  /** Slippage percentage */
  slippagePct: number;
}

/**
 * Common quote parameters
 */
export interface BaseQuoteParams {
  /** Token to sell (address) */
  sellToken: string;
  /** Token to buy (address) */
  buyToken: string;
  /** Address that will execute the swap */
  takerAddress: string;
  /** Amount to sell (in token's smallest unit) */
  sellAmount?: string;
  /** Amount to buy (in token's smallest unit) */
  buyAmount?: string;
  /** Slippage percentage (e.g., 0.01 for 1%) */
  slippagePercentage?: number;
  /** Skip validation */
  skipValidation?: boolean;
  /** Affiliate address for fee sharing */
  affiliateAddress?: string;
}

// ============================================================================
// PRICE QUOTE (Indicative)
// ============================================================================

export interface PriceParams extends BaseQuoteParams {}

export interface PriceResponse {
  chainId: number;
  price: string;
  estimatedPriceImpact: string;
  value: string;
  gasPrice: string;
  gas: string;
  estimatedGas: string;
  protocolFee: string;
  minimumProtocolFee: string;
  buyTokenAddress: string;
  buyAmount: string;
  sellTokenAddress: string;
  sellAmount: string;
  sources: Array<{ name: string; proportion: string }>;
  allowanceTarget: string;
  sellTokenToEthRate: string;
  buyTokenToEthRate: string;
  expectedSlippage: string | null;
}

// ============================================================================
// FIRM QUOTE
// ============================================================================

export interface QuoteParams extends BaseQuoteParams {}

export interface QuoteResponse extends PriceResponse {
  guaranteedPrice: string;
  to: string;
  data: string;
  orders: any[];
  fees: {
    zeroExFee: {
      feeType: string;
      feeToken: string;
      feeAmount: string;
      billingType: string;
    };
  };
  auxiliaryChainData: any;
}

// ============================================================================
// QUOTE SWAP (High-level operation)
// ============================================================================

export interface QuoteSwapParams {
  /** Network to use */
  network: string;
  /** Base token symbol or address */
  baseToken: string;
  /** Quote token symbol or address */
  quoteToken: string;
  /** Amount in base token units (decimal) */
  amount: number;
  /** Trade direction */
  side: 'BUY' | 'SELL';
  /** Slippage percentage (1-100) */
  slippagePct: number;
  /** If true, returns indicative price. If false, returns firm quote */
  indicativePrice?: boolean;
  /** Wallet address (optional for indicative quotes) */
  takerAddress?: string;
}

export interface QuoteSwapResult {
  /** Unique quote identifier */
  quoteId: string;
  /** Token being sold (address) */
  tokenIn: string;
  /** Token being bought (address) */
  tokenOut: string;
  /** Amount of tokenIn */
  amountIn: number;
  /** Amount of tokenOut */
  amountOut: number;
  /** Exchange rate */
  price: number;
  /** Price impact percentage */
  priceImpactPct: number;
  /** Minimum amount out (after slippage) */
  minAmountOut: number;
  /** Maximum amount in (after slippage) */
  maxAmountIn: number;
  /** Gas estimate */
  gasEstimate: string;
  /** Quote expiration time (only for firm quotes) */
  expirationTime?: number;
  /** Liquidity sources used */
  sources?: Array<{ name: string; proportion: string }>;
  /** Contract that needs approval */
  allowanceTarget?: string;
  /** Contract to send tx to */
  to?: string;
  /** Encoded transaction data */
  data?: string;
  /** ETH value to send */
  value?: string;
}

// ============================================================================
// EXECUTE QUOTE
// ============================================================================

export interface ExecuteQuoteParams {
  /** Wallet address */
  walletAddress: string;
  /** Network */
  network: string;
  /** Quote ID to execute */
  quoteId: string;
  /** Gas price (optional) */
  gasPrice?: string;
  /** Max gas limit (optional) */
  maxGas?: number;
}

export interface ExecuteQuoteResult {
  /** Transaction signature/hash */
  signature: string;
  /** Transaction status: -1 = failed, 0 = pending, 1 = confirmed */
  status: number;
  /** Transaction details */
  data?: {
    /** Amount of input token */
    amountIn: number;
    /** Amount of output token */
    amountOut: number;
    /** Input token address */
    tokenIn: string;
    /** Output token address */
    tokenOut: string;
    /** Transaction fee */
    fee: number;
    /** Change in base token balance */
    baseTokenBalanceChange: number;
    /** Change in quote token balance */
    quoteTokenBalanceChange: number;
  };
}

// ============================================================================
// EXECUTE SWAP (Quote + Execute)
// ============================================================================

export interface ExecuteSwapParams {
  /** Wallet address */
  walletAddress: string;
  /** Network */
  network: string;
  /** Base token symbol or address */
  baseToken: string;
  /** Quote token symbol or address */
  quoteToken: string;
  /** Amount in base token units */
  amount: number;
  /** Trade direction */
  side: 'BUY' | 'SELL';
  /** Slippage percentage */
  slippagePct: number;
  /** Gas price (optional) */
  gasPrice?: string;
  /** Max gas limit (optional) */
  maxGas?: number;
}

export type ExecuteSwapResult = ExecuteQuoteResult;

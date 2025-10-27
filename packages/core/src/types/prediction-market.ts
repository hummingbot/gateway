/**
 * Prediction Market Protocol Types
 *
 * Defines standard interfaces for prediction market protocols like Polymarket.
 * These extend the base Protocol interface with prediction-market-specific operations.
 */

import { Protocol, OperationBuilder, QueryFunction } from './protocol';

/**
 * Market status
 */
export enum MarketStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled',
}

/**
 * Outcome type for binary markets
 */
export enum BinaryOutcome {
  YES = 'yes',
  NO = 'no',
}

/**
 * Market information
 */
export interface MarketInfo {
  /** Unique market identifier */
  marketId: string;

  /** Market question/description */
  question: string;

  /** Market status */
  status: MarketStatus;

  /** Resolution timestamp */
  endTime: Date;

  /** Possible outcomes */
  outcomes: string[];

  /** Current odds/prices for each outcome (0-1) */
  prices: Record<string, number>;

  /** Total volume */
  volume: string;

  /** Total liquidity */
  liquidity: string;

  /** Resolution source (oracle, etc.) */
  resolutionSource?: string;

  /** Resolved outcome (if resolved) */
  resolvedOutcome?: string;

  /** Market metadata */
  metadata?: {
    category?: string;
    tags?: string[];
    creator?: string;
  };
}

/**
 * User position in a market
 */
export interface MarketPosition {
  marketId: string;
  outcome: string;
  shares: string;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnL: string;
  realizedPnL?: string;
}

/**
 * Orderbook data
 */
export interface OrderbookData {
  marketId: string;
  outcome: string;
  bids: Array<{ price: number; size: string }>;
  asks: Array<{ price: number; size: string }>;
  spread: number;
}

/**
 * Create Market Parameters
 */
export interface CreateMarketParams {
  /** Market question */
  question: string;

  /** Market description */
  description?: string;

  /** Possible outcomes (e.g., ['YES', 'NO']) */
  outcomes: string[];

  /** Market end time */
  endTime: Date;

  /** Initial liquidity to provide */
  initialLiquidity?: string;

  /** Resolution source */
  resolutionSource?: string;

  /** Market category/tags */
  category?: string;
  tags?: string[];
}

/**
 * Buy Outcome Parameters
 */
export interface BuyOutcomeParams {
  /** Market identifier */
  marketId: string;

  /** Outcome to buy */
  outcome: string;

  /** Amount to spend (in base currency) */
  amount: string;

  /** Maximum price willing to pay (0-1) */
  maxPrice: number;

  /** Slippage tolerance (percentage) */
  slippage?: number;
}

/**
 * Sell Outcome Parameters
 */
export interface SellOutcomeParams {
  /** Market identifier */
  marketId: string;

  /** Outcome to sell */
  outcome: string;

  /** Amount of shares to sell */
  shares: string;

  /** Minimum price to accept (0-1) */
  minPrice: number;

  /** Slippage tolerance (percentage) */
  slippage?: number;
}

/**
 * Claim Winnings Parameters
 */
export interface ClaimWinningsParams {
  /** Market identifier */
  marketId: string;

  /** User address (optional if using default wallet) */
  userAddress?: string;
}

/**
 * Get Market Parameters
 */
export interface GetMarketParams {
  marketId: string;
}

/**
 * Get Odds Parameters
 */
export interface GetOddsParams {
  marketId: string;
}

/**
 * Get Position Parameters
 */
export interface GetPositionParams {
  userAddress: string;
  marketId: string;
}

/**
 * Get Orderbook Parameters
 */
export interface GetOrderbookParams {
  marketId: string;
  outcome: string;
}

/**
 * Prediction Market Protocol Operations
 */
export interface PredictionMarketOperations extends Record<string, OperationBuilder<any, any>> {
  /** Create a new prediction market */
  createMarket: OperationBuilder<CreateMarketParams, { marketId: string }>;

  /** Buy outcome shares */
  buyOutcome: OperationBuilder<BuyOutcomeParams, { shares: string; averagePrice: number }>;

  /** Sell outcome shares */
  sellOutcome: OperationBuilder<SellOutcomeParams, { amount: string; averagePrice: number }>;

  /** Claim winnings from resolved market */
  claimWinnings: OperationBuilder<ClaimWinningsParams, { amount: string }>;
}

/**
 * Prediction Market Protocol Queries
 */
export interface PredictionMarketQueries extends Record<string, QueryFunction<any, any>> {
  /** Get market information */
  getMarket: QueryFunction<GetMarketParams, MarketInfo>;

  /** Get current odds for a market */
  getOdds: QueryFunction<GetOddsParams, Record<string, number>>;

  /** Get user position in a market */
  getPosition: QueryFunction<GetPositionParams, MarketPosition | null>;

  /** Get orderbook data */
  getOrderbook: QueryFunction<GetOrderbookParams, OrderbookData>;

  /** Get all user positions */
  getUserPositions: QueryFunction<{ userAddress: string }, MarketPosition[]>;

  /** Get active markets */
  getActiveMarkets: QueryFunction<{ category?: string; limit?: number }, MarketInfo[]>;
}

/**
 * Prediction Market Protocol Interface
 *
 * Extends the base Protocol interface with prediction-market-specific
 * strongly-typed operations and queries.
 */
export interface PredictionMarketProtocol extends Protocol {
  readonly operations: PredictionMarketOperations;
  readonly queries: PredictionMarketQueries;
}

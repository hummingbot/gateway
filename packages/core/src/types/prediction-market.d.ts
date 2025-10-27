import { Protocol, OperationBuilder, QueryFunction } from './protocol';
export declare enum MarketStatus {
    ACTIVE = "active",
    CLOSED = "closed",
    RESOLVED = "resolved",
    CANCELLED = "cancelled"
}
export declare enum BinaryOutcome {
    YES = "yes",
    NO = "no"
}
export interface MarketInfo {
    marketId: string;
    question: string;
    status: MarketStatus;
    endTime: Date;
    outcomes: string[];
    prices: Record<string, number>;
    volume: string;
    liquidity: string;
    resolutionSource?: string;
    resolvedOutcome?: string;
    metadata?: {
        category?: string;
        tags?: string[];
        creator?: string;
    };
}
export interface MarketPosition {
    marketId: string;
    outcome: string;
    shares: string;
    averagePrice: number;
    currentPrice: number;
    unrealizedPnL: string;
    realizedPnL?: string;
}
export interface OrderbookData {
    marketId: string;
    outcome: string;
    bids: Array<{
        price: number;
        size: string;
    }>;
    asks: Array<{
        price: number;
        size: string;
    }>;
    spread: number;
}
export interface CreateMarketParams {
    question: string;
    description?: string;
    outcomes: string[];
    endTime: Date;
    initialLiquidity?: string;
    resolutionSource?: string;
    category?: string;
    tags?: string[];
}
export interface BuyOutcomeParams {
    marketId: string;
    outcome: string;
    amount: string;
    maxPrice: number;
    slippage?: number;
}
export interface SellOutcomeParams {
    marketId: string;
    outcome: string;
    shares: string;
    minPrice: number;
    slippage?: number;
}
export interface ClaimWinningsParams {
    marketId: string;
    userAddress?: string;
}
export interface GetMarketParams {
    marketId: string;
}
export interface GetOddsParams {
    marketId: string;
}
export interface GetPositionParams {
    userAddress: string;
    marketId: string;
}
export interface GetOrderbookParams {
    marketId: string;
    outcome: string;
}
export interface PredictionMarketOperations {
    createMarket: OperationBuilder<CreateMarketParams, {
        marketId: string;
    }>;
    buyOutcome: OperationBuilder<BuyOutcomeParams, {
        shares: string;
        averagePrice: number;
    }>;
    sellOutcome: OperationBuilder<SellOutcomeParams, {
        amount: string;
        averagePrice: number;
    }>;
    claimWinnings: OperationBuilder<ClaimWinningsParams, {
        amount: string;
    }>;
}
export interface PredictionMarketQueries {
    getMarket: QueryFunction<GetMarketParams, MarketInfo>;
    getOdds: QueryFunction<GetOddsParams, Record<string, number>>;
    getPosition: QueryFunction<GetPositionParams, MarketPosition | null>;
    getOrderbook: QueryFunction<GetOrderbookParams, OrderbookData>;
    getUserPositions: QueryFunction<{
        userAddress: string;
    }, MarketPosition[]>;
    getActiveMarkets: QueryFunction<{
        category?: string;
        limit?: number;
    }, MarketInfo[]>;
}
export interface PredictionMarketProtocol extends Protocol {
    readonly operations: PredictionMarketOperations;
    readonly queries: PredictionMarketQueries;
}

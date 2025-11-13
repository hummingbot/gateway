/**
 * Gateway Types Module
 *
 * This module re-exports all commonly used types from Gateway backend schemas.
 * It serves as a single import point for Gateway types across the frontend application.
 *
 * Benefits:
 * - Single source of truth (Gateway schemas)
 * - Types automatically stay in sync with backend
 * - Compile-time validation of API responses
 * - Better IDE autocomplete and type checking
 *
 * Usage:
 * ```typescript
 * import type { TokenInfo, PositionInfo, RouterQuoteResponse } from '@/lib/gateway-types';
 * ```
 */

// ==================== Chain Schema Types ====================
export type {
  // Transaction status
  TransactionStatus,

  // Balance operations
  BalanceRequestType,
  BalanceResponseType,

  // Token operations
  TokensRequestType,
  TokensResponseType,

  // Chain status
  StatusRequestType,
  StatusResponseType,

  // Transaction polling
  PollRequestType,
  PollResponseType,

  // Gas estimation
  EstimateGasRequestType,
  EstimateGasResponse,
} from '@gateway/schemas/chain-schema';

// ==================== CLMM Schema Types ====================
export type {
  // Position types
  PositionInfo,
  GetPositionsOwnedRequestType,
  GetPositionInfoRequestType,

  // Pool types
  PoolInfo as CLMMPoolInfo,
  MeteoraPoolInfo,
  BinLiquidity,
  FetchPoolsRequestType,
  GetPoolInfoRequestType,

  // Position operations
  OpenPositionRequestType,
  OpenPositionResponseType,
  AddLiquidityRequestType,
  AddLiquidityResponseType,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
  CollectFeesRequestType,
  CollectFeesResponseType,
  ClosePositionRequestType,
  ClosePositionResponseType,
  QuotePositionRequestType,
  QuotePositionResponseType,

  // CLMM Swap types
  QuoteSwapRequestType as CLMMQuoteRequest,
  QuoteSwapResponseType as CLMMQuoteResponse,
  ExecuteSwapRequestType as CLMMExecuteRequest,
  ExecuteSwapResponseType as CLMMExecuteResponse,
} from '@gateway/schemas/clmm-schema';

// ==================== AMM Schema Types ====================
export type {
  // Pool types
  PoolInfo as AMMPoolInfo,
  GetPoolInfoRequestType as AMMGetPoolInfoRequest,

  // Liquidity operations
  AddLiquidityRequestType as AMMAddLiquidityRequest,
  AddLiquidityResponseType as AMMAddLiquidityResponse,
  RemoveLiquidityRequestType as AMMRemoveLiquidityRequest,
  RemoveLiquidityResponseType as AMMRemoveLiquidityResponse,

  // AMM Swap types
  QuoteSwapRequestType as AMMQuoteRequest,
  QuoteSwapResponseType as AMMQuoteResponse,
  ExecuteSwapRequestType as AMMExecuteRequest,
  ExecuteSwapResponseType as AMMExecuteResponse,
} from '@gateway/schemas/amm-schema';

// ==================== Router Schema Types ====================
export type {
  // Router swap types (for Jupiter, 0x aggregators)
  QuoteSwapRequestType as RouterQuoteRequest,
  QuoteSwapResponseType as RouterQuoteResponse,
  ExecuteQuoteRequestType as RouterExecuteQuoteRequest,
  ExecuteSwapRequestType as RouterExecuteRequest,
  SwapExecuteResponseType as RouterExecuteResponse,
} from '@gateway/schemas/router-schema';

// ==================== Convenience Types ====================

import type { TokensResponseType } from '@gateway/schemas/chain-schema';
import type { PositionInfo, PoolInfo as CLMMPoolInfo } from '@gateway/schemas/clmm-schema';

/**
 * Token information extracted from Gateway TokensResponse
 * Represents a single token with symbol, address, decimals, and name
 */
export type TokenInfo = TokensResponseType['tokens'][number];

/**
 * Position with UI-specific connector field
 * Extends Gateway's PositionInfo to track which connector owns the position
 */
export interface PositionWithConnector extends PositionInfo {
  /** Name of the connector (raydium, meteora, etc.) */
  connector: string;
}

/**
 * Connector configuration from Gateway config API
 * Used to determine which connectors support which features per chain/network
 */
export interface ConnectorConfig {
  /** Connector name (e.g., 'raydium', 'meteora', 'jupiter') */
  name: string;
  /** Supported trading types ('router', 'amm', 'clmm') */
  trading_types: string[];
  /** Chain this connector operates on */
  chain: string;
  /** Networks supported by this connector */
  networks: string[];
}

/**
 * Pool template structure
 * Represents pool configuration stored in Gateway's pool templates
 * Note: This differs from PoolInfo which is fetched from pool-info API
 */
export interface PoolTemplate {
  /** Pool type: 'amm' or 'clmm' */
  type: 'amm' | 'clmm';
  /** Network name */
  network: string;
  /** Base token symbol */
  baseSymbol: string;
  /** Quote token symbol */
  quoteSymbol: string;
  /** Pool contract address */
  address: string;
  /** Base token contract address */
  baseTokenAddress: string;
  /** Quote token contract address */
  quoteTokenAddress: string;
  /** Pool fee percentage */
  feePct: number;
  /** Connector name (added by UI) */
  connector?: string;
}

/**
 * Extended pool info that includes fields from both Meteora DLMM and Uniswap V3 CLMM pools
 * This is a UI-friendly union of all possible pool info fields
 */
export interface ExtendedPoolInfo extends CLMMPoolInfo {
  /** Uniswap V3 specific: square root of price */
  sqrtPriceX64?: string;
  /** Uniswap V3 specific: current tick */
  tick?: number;
  /** Uniswap V3 specific: total liquidity */
  liquidity?: string;
}

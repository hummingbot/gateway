/**
 * Core Protocol Interfaces
 *
 * These interfaces define the protocol-agnostic abstraction layer
 * that works across all protocol types: DEX, Prediction Markets, Lending, etc.
 */

/**
 * Protocol Types - First-class categories
 */
export enum ProtocolType {
  // DEX protocols
  DEX_AMM = 'dex-amm',              // Constant product AMM (Uniswap V2, Raydium AMM)
  DEX_CLMM = 'dex-clmm',            // Concentrated liquidity (Uniswap V3, Raydium CLMM, Meteora)
  DEX_ROUTER = 'dex-router',        // DEX aggregators (Jupiter, 0x, Uniswap Universal Router)
  DEX_ORDERBOOK = 'dex-orderbook',  // Orderbook DEX (Serum, dYdX)

  // Other protocol types
  PREDICTION_MARKET = 'prediction-market',  // Polymarket, Augur
  LENDING = 'lending',                      // Aave, Compound, Solend
  TOKEN_LAUNCH = 'token-launch',            // Pump.fun, token factories
  DERIVATIVES = 'derivatives',              // Hyperliquid, perpetual protocols
  STAKING = 'staking',                      // Staking protocols
  GOVERNANCE = 'governance',                // DAO governance
}

/**
 * Chain Types
 */
export enum ChainType {
  SOLANA = 'solana',
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  BASE = 'base',
  OPTIMISM = 'optimism',
  BSC = 'bsc',
  AVALANCHE = 'avalanche',
}

/**
 * Base transaction type (chain-agnostic)
 */
export interface Transaction {
  /** Chain-specific transaction object */
  raw: any;

  /** Human-readable description */
  description?: string;

  /** Estimated gas/fees */
  estimatedFee?: {
    amount: string;
    token: string;
  };

  /** Simulation result if available */
  simulation?: SimulationResult;
}

/**
 * Simulation result for transaction preview
 */
export interface SimulationResult {
  success: boolean;
  error?: string;

  /** Expected state changes */
  changes?: {
    balanceChanges?: Array<{
      token: string;
      amount: string;
      direction: 'in' | 'out';
      note?: string; // Optional explanation of the balance change
    }>;

    positionChanges?: Array<{
      type: string;
      description: string;
    }>;
  };

  /** Gas/fee estimation */
  estimatedFee?: {
    amount: string;
    token: string;
  };

  /** Additional metadata specific to the operation */
  metadata?: Record<string, any>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Universal Protocol Interface
 *
 * All protocols (DEX, Lending, Prediction Markets, etc.) implement this interface.
 * This provides a consistent API across completely different protocol types.
 */
export interface Protocol<TConfig = any> {
  /** Protocol identifier (e.g., 'raydium', 'polymarket', 'aave') */
  readonly name: string;

  /** Chain this protocol operates on */
  readonly chain: ChainType;

  /** Network (mainnet, devnet, testnet) */
  readonly network: string;

  /** Protocol type (DEX_AMM, PREDICTION_MARKET, etc.) */
  readonly protocolType: ProtocolType;

  /** Protocol version (e.g., 'v2', 'v3') */
  readonly version?: string;

  /**
   * Mutable operations that build transactions
   *
   * Examples:
   * - DEX: addLiquidity, swap, createPool
   * - Prediction Market: buyOutcome, createMarket
   * - Lending: supply, borrow, repay
   */
  readonly operations: Record<string, OperationBuilder<any, any>>;

  /**
   * Read-only data queries
   *
   * Examples:
   * - DEX: getPool, getPosition, getPrice
   * - Prediction Market: getMarket, getOdds, getPosition
   * - Lending: getHealthFactor, getAPY, getUserPosition
   */
  readonly queries: Record<string, QueryFunction<any, any>>;

  /**
   * Initialize the protocol with configuration
   */
  initialize(config: TConfig): Promise<void>;

  /**
   * Health check - verify protocol is operational
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get protocol metadata
   */
  getMetadata(): ProtocolMetadata;
}

/**
 * Protocol metadata
 */
export interface ProtocolMetadata {
  name: string;
  displayName: string;
  description: string;
  chain: ChainType;
  network: string;
  protocolType: ProtocolType;
  version?: string;
  website?: string;
  documentation?: string;

  /** Supported operations */
  supportedOperations: string[];

  /** Available queries */
  availableQueries: string[];
}

/**
 * Operation Builder - Consistent pattern for all mutable actions
 *
 * All operations (swap, addLiquidity, buyOutcome, supply, etc.)
 * follow this same pattern, regardless of protocol type.
 */
export interface OperationBuilder<TParams, TResult = any> {
  /**
   * Validate parameters before building transaction
   */
  validate(params: TParams): Promise<ValidationResult>;

  /**
   * Simulate transaction execution without submitting
   * Returns expected outcome, state changes, and fees
   */
  simulate(params: TParams): Promise<SimulationResult>;

  /**
   * Build unsigned transaction
   * This is the core method - creates the transaction object
   */
  build(params: TParams): Promise<Transaction>;

  /**
   * Execute transaction (optional - can be done externally)
   * Some implementations may provide execution, others may not
   */
  execute?(params: TParams): Promise<TResult>;
}

/**
 * Query Function - Read-only data fetching
 */
export type QueryFunction<TParams, TResult> = (params: TParams) => Promise<TResult>;

/**
 * Protocol Factory - Creates protocol instances
 */
export interface ProtocolFactory {
  /**
   * Create a protocol instance
   */
  create(config: {
    protocol: string;
    chain: ChainType;
    network: string;
    options?: any;
  }): Promise<Protocol>;

  /**
   * List available protocols
   */
  listProtocols(): Array<{
    name: string;
    chains: ChainType[];
    protocolType: ProtocolType;
  }>;
}

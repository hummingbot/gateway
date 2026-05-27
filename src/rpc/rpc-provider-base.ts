import { logger } from '../services/logger';

/**
 * Configuration interface for all RPC providers
 */
export interface RPCProviderConfig {
  apiKey: string;
}

/**
 * Network information for RPC provider initialization
 * Supports both Solana and Ethereum networks
 */
export interface NetworkInfo {
  chain: 'solana' | 'ethereum';
  network: string;
  chainId: number; // Chain ID (101 for Solana mainnet, 1 for Ethereum mainnet, etc.)
}

/**
 * Result of transaction monitoring
 */
export interface TransactionMonitorResult {
  confirmed: boolean;
  txData?: any;
}

/**
 * Base abstract class for all RPC providers
 *
 * Provides common functionality for:
 * - API key validation
 * - WebSocket configuration
 * - URL generation
 * - Connection lifecycle management
 *
 * Subclasses must implement provider-specific logic for:
 * - HTTP/WebSocket URL construction
 * - Connection initialization
 * - Resource cleanup
 */
export abstract class RPCProvider {
  protected config: RPCProviderConfig;
  protected networkInfo: NetworkInfo;
  protected ws: any = null; // Generic WebSocket reference (can be ws.WebSocket or ethers.WebSocketProvider)

  constructor(config: RPCProviderConfig, networkInfo: NetworkInfo) {
    this.config = config;
    this.networkInfo = networkInfo;
    this.validateConfig();
  }

  /**
   * Validate the provider configuration
   * Logs warnings if API key is invalid
   */
  protected validateConfig(): void {
    if (!this.isApiKeyValid()) {
      logger.warn(
        `${this.constructor.name}: Invalid or missing API key for ${this.networkInfo.chain}/${this.networkInfo.network}, provider features disabled`,
      );
    }
  }

  /**
   * Check if the API key is valid
   * Returns false for empty strings, placeholder values, or missing keys
   */
  protected isApiKeyValid(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.apiKey.trim() !== '' &&
      !this.config.apiKey.includes('YOUR_') &&
      !this.config.apiKey.includes('_API_KEY_HERE')
    );
  }

  /**
   * Check if WebSocket is currently connected
   * Override in subclasses to provide provider-specific implementation
   */
  public isWebSocketConnected(): boolean {
    return false; // Default implementation - subclasses should override
  }

  /**
   * Get the HTTP RPC URL for this provider and network.
   * Returns null when the URL is not yet available (e.g. before initialize()
   * has resolved discovery). Subclasses override to return a concrete URL.
   * Callers can swap their RPC connection whenever this returns a non-null
   * value, without needing to know which provider subclass is in use.
   */
  public getHttpUrl(): string | null {
    return null;
  }

  /**
   * Get the WebSocket RPC URL for this provider and network
   * Returns null if WebSocket is not supported or not configured
   * Must be implemented by subclasses
   */
  public abstract getWebSocketUrl(): string | null;

  /**
   * Initialize the RPC provider
   * This may include connecting to WebSocket, warming connections, etc.
   * Must be implemented by subclasses
   */
  public abstract initialize(): Promise<void>;

  /**
   * Disconnect and clean up all resources
   * Must be implemented by subclasses
   */
  public abstract disconnect(): void;

  /**
   * Health check - verify RPC connection is working
   * Optional method with default implementation
   * Subclasses can override for provider-specific health checks
   */
  public async healthCheck(): Promise<boolean> {
    logger.warn(`${this.constructor.name}: healthCheck not implemented`);
    return true;
  }

  /**
   * Check if transaction monitoring via WebSocket is supported
   * Subclasses should override to return true if they support monitoring
   */
  public supportsTransactionMonitoring(): boolean {
    return false;
  }

  /**
   * Monitor a transaction for confirmation via WebSocket
   * Connects on-demand if not already connected
   * Subclasses should override to provide implementation
   * @param signature Transaction signature to monitor
   * @param timeoutMs Timeout in milliseconds
   * @throws Error if monitoring is not supported or fails
   */
  public async monitorTransaction(_signature: string, _timeoutMs?: number): Promise<TransactionMonitorResult> {
    throw new Error(`${this.constructor.name}: monitorTransaction not implemented`);
  }

  /**
   * Get the provider name (class name)
   * Useful for logging and debugging
   */
  public getProviderName(): string {
    return this.constructor.name;
  }

  /**
   * Get network information
   */
  public getNetworkInfo(): NetworkInfo {
    return this.networkInfo;
  }
}

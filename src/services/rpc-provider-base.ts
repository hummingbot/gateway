import { logger } from './logger';

/**
 * Configuration interface for all RPC providers
 * Matches the shared rpc-provider-schema.json
 */
export interface RPCProviderConfig {
  apiKey: string;
  useWebSocket: boolean;
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
   * Check if WebSocket should be used
   * Requires both useWebSocket config and valid API key
   */
  protected shouldUseWebSocket(): boolean {
    return this.config.useWebSocket && this.isApiKeyValid();
  }

  /**
   * Check if WebSocket is currently connected
   * Override in subclasses to provide provider-specific implementation
   */
  public isWebSocketConnected(): boolean {
    return false; // Default implementation - subclasses should override
  }

  /**
   * Get the HTTP RPC URL for this provider and network
   * Must be implemented by subclasses
   */
  public abstract getHttpUrl(): string;

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

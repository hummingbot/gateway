import WebSocket from 'ws';

import { logger } from '../../services/logger';

import { SolanaNetworkConfig } from './solana.config';

interface TransactionMonitorResult {
  confirmed: boolean;
  txData?: any;
}

interface WebSocketSubscription {
  signature: string;
  resolve: (result: TransactionMonitorResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface AccountSubscriptionCallback {
  (accountInfo: any, context: { slot: number }): void | Promise<void>;
}

interface AccountSubscription {
  address: string;
  callback: AccountSubscriptionCallback;
  encoding?: string;
  commitment?: string;
}

interface WebSocketMessage {
  jsonrpc: string;
  method?: string;
  params?: {
    result: {
      context: {
        slot: number;
      };
      value:
        | {
            err: any;
          }
        | string
        | any; // For account notifications
    };
    subscription: number;
  };
  result?: number;
  id?: number;
  error?: any;
}

/**
 * Helius Service - Consolidates WebSocket monitoring and connection warming
 * Provides optimized transaction confirmation and connection management
 */
export class HeliusService {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<number, WebSocketSubscription>();
  private accountSubscriptions = new Map<number, AccountSubscription>();
  private nextSubscriptionId = 1;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private config: SolanaNetworkConfig) {}

  /**
   * Get the Helius RPC URL for a specific network
   */
  public getUrlForNetwork(network: string): string {
    const isDevnet = network.includes('devnet');
    return isDevnet
      ? `https://devnet.helius-rpc.com/?api-key=${this.config.heliusAPIKey}`
      : `https://mainnet.helius-rpc.com/?api-key=${this.config.heliusAPIKey}`;
  }

  /**
   * Initialize Helius services (WebSocket)
   */
  public async initialize(): Promise<void> {
    // Initialize WebSocket if enabled
    if (this.shouldUseWebSocket()) {
      await this.initializeWebSocket();
    }
  }

  /**
   * Initialize WebSocket connection for real-time transaction monitoring
   */
  private async initializeWebSocket(): Promise<void> {
    try {
      await this.connectWebSocket();
      logger.info('✅ Helius WebSocket monitor successfully initialized');
    } catch (error: any) {
      logger.warn(`❌ Failed to initialize Helius WebSocket: ${error.message}, falling back to polling`);
      this.ws = null;
    }
  }

  /**
   * Connect to Helius WebSocket endpoint
   */
  private async connectWebSocket(): Promise<void> {
    // Support both mainnet and devnet WebSocket endpoints
    const isDevnet = this.config.nodeURL.includes('devnet');
    const wsUrl = isDevnet
      ? `wss://devnet.helius-rpc.com/?api-key=${this.config.heliusAPIKey}`
      : `wss://mainnet.helius-rpc.com/?api-key=${this.config.heliusAPIKey}`;

    logger.info(`Connecting to Helius WebSocket (${isDevnet ? 'devnet' : 'mainnet'}) endpoint`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          logger.info('Connected to Helius WebSocket for transaction monitoring');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message: WebSocketMessage = JSON.parse(data.toString());
            this.handleWebSocketMessage(message);
          } catch (error: any) {
            logger.error(`Error parsing WebSocket message: ${error.message}`);
          }
        });

        this.ws.on('error', (error) => {
          logger.error(`WebSocket connection error: ${error.message}`);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          logger.warn(`WebSocket connection closed: code=${code}, reason=${reason?.toString()}`);
          this.handleWebSocketDisconnection();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(message: WebSocketMessage): void {
    if (message.method === 'signatureNotification' && message.params) {
      const subscriptionId = message.params.subscription;
      const result = message.params.result;

      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        clearTimeout(subscription.timeout);
        this.subscriptions.delete(subscriptionId);

        // Unsubscribe from this signature
        this.unsubscribeFromSignature(subscriptionId);

        if (result && result.value && typeof result.value === 'object' && 'err' in result.value && result.value.err) {
          logger.info(`Transaction ${subscription.signature} failed: ${JSON.stringify(result.value.err)}`);
          subscription.resolve({ confirmed: false, txData: result });
        } else {
          logger.info(`Transaction ${subscription.signature} confirmed via WebSocket`);
          subscription.resolve({ confirmed: true, txData: result });
        }
      }
    } else if (message.method === 'accountNotification' && message.params) {
      // Handle account subscription notifications
      const subscriptionId = message.params.subscription;
      const result = message.params.result;

      const subscription = this.accountSubscriptions.get(subscriptionId);
      if (subscription && result) {
        const context = result.context || { slot: 0 };
        const accountInfo = result.value;

        // Call the callback with account info and context
        Promise.resolve(subscription.callback(accountInfo, context)).catch((error) => {
          logger.error(`Error in account subscription callback for ${subscription.address}: ${error.message}`);
        });
      }
    } else if (message.result && typeof message.id === 'number') {
      // Subscription confirmation - remap from local ID to server subscription ID
      const localId = message.id;
      const serverSubscriptionId = message.result;
      logger.debug(`WebSocket subscription ${localId} confirmed with server ID ${serverSubscriptionId}`);

      // Move subscription from local ID to server subscription ID
      const subscription = this.subscriptions.get(localId);
      if (subscription) {
        this.subscriptions.delete(localId);
        this.subscriptions.set(serverSubscriptionId, subscription);
        logger.debug(`Remapped subscription from local ID ${localId} to server ID ${serverSubscriptionId}`);
      }
    } else if (message.error) {
      logger.error(`WebSocket subscription error: ${JSON.stringify(message.error)}`);
      const subscription = this.subscriptions.get(message.id!);
      if (subscription) {
        clearTimeout(subscription.timeout);
        this.subscriptions.delete(message.id!);
        subscription.reject(new Error(`WebSocket error: ${message.error.message}`));
      }
    }
  }

  /**
   * Monitor a transaction signature for confirmation via WebSocket
   */
  public async monitorTransaction(signature: string, timeoutMs: number = 30000): Promise<TransactionMonitorResult> {
    if (!this.isWebSocketConnected()) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const subscriptionId = this.nextSubscriptionId++;

      // Set up timeout
      const timeout = setTimeout(() => {
        this.subscriptions.delete(subscriptionId);
        resolve({ confirmed: false });
      }, timeoutMs);

      // Store subscription details
      this.subscriptions.set(subscriptionId, {
        signature,
        resolve,
        reject,
        timeout,
      });

      // Subscribe to signature logs
      const subscribeMessage = {
        jsonrpc: '2.0',
        id: subscriptionId,
        method: 'signatureSubscribe',
        params: [
          signature,
          {
            commitment: 'confirmed',
          },
        ],
      };

      this.ws!.send(JSON.stringify(subscribeMessage));
      logger.info(`Monitoring transaction ${signature} via WebSocket subscription ${subscriptionId}`);
    });
  }

  /**
   * Unsubscribe from a signature subscription
   */
  private unsubscribeFromSignature(subscriptionId: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const unsubscribeMessage = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'signatureUnsubscribe',
        params: [subscriptionId],
      };
      this.ws.send(JSON.stringify(unsubscribeMessage));
    }
  }

  /**
   * Handle WebSocket disconnection and attempt reconnection
   */
  private handleWebSocketDisconnection(): void {
    // Reject all pending subscriptions
    for (const [subscriptionId, subscription] of this.subscriptions) {
      clearTimeout(subscription.timeout);
      subscription.reject(new Error('WebSocket disconnected'));
    }
    this.subscriptions.clear();

    // Store account subscriptions for restoration after reconnection
    const accountSubsToRestore = Array.from(this.accountSubscriptions.values());

    // Attempt reconnection if within retry limits
    if (this.shouldUseWebSocket() && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      logger.info(
        `Attempting WebSocket reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${backoffMs}ms`,
      );

      this.reconnectTimeout = setTimeout(async () => {
        try {
          await this.connectWebSocket();
          // Restore account subscriptions after successful reconnection
          await this.restoreAccountSubscriptions(accountSubsToRestore);
        } catch (error: any) {
          logger.error(`WebSocket reconnection failed: ${error.message}`);
        }
      }, backoffMs);
    }
  }

  /**
   * Restore account subscriptions after reconnection
   */
  private async restoreAccountSubscriptions(subscriptions: AccountSubscription[]): Promise<void> {
    if (subscriptions.length === 0) {
      return;
    }

    logger.info(`Restoring ${subscriptions.length} account subscription(s) after reconnection...`);

    for (const sub of subscriptions) {
      try {
        await this.subscribeToAccount(sub.address, sub.callback, {
          encoding: sub.encoding as any,
          commitment: sub.commitment as any,
        });
      } catch (error: any) {
        logger.error(`Failed to restore account subscription for ${sub.address}: ${error.message}`);
      }
    }
  }

  /**
   * Check if WebSocket monitoring is available
   */
  public isWebSocketConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Check if should use WebSocket
   */
  private shouldUseWebSocket(): boolean {
    return (
      this.config.useHeliusWebSocketRPC &&
      this.config.heliusAPIKey &&
      this.config.heliusAPIKey.trim() !== '' &&
      this.config.heliusAPIKey !== 'HELIUS_API_KEY'
    );
  }

  /**
   * Subscribe to account changes via WebSocket
   * @param address Account public key to monitor
   * @param callback Function called when account changes
   * @param options Encoding and commitment options
   * @returns Subscription ID for unsubscribing
   */
  public async subscribeToAccount(
    address: string,
    callback: AccountSubscriptionCallback,
    options?: {
      encoding?: 'base58' | 'base64' | 'jsonParsed';
      commitment?: 'processed' | 'confirmed' | 'finalized';
    },
  ): Promise<number> {
    if (!this.isWebSocketConnected()) {
      throw new Error('WebSocket not connected');
    }

    const subscriptionId = this.nextSubscriptionId++;
    const encoding = options?.encoding || 'jsonParsed';
    const commitment = options?.commitment || 'confirmed';

    // Store subscription details
    this.accountSubscriptions.set(subscriptionId, {
      address,
      callback,
      encoding,
      commitment,
    });

    // Subscribe to account via WebSocket
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: subscriptionId,
      method: 'accountSubscribe',
      params: [
        address,
        {
          encoding,
          commitment,
        },
      ],
    };

    this.ws!.send(JSON.stringify(subscribeMessage));
    logger.info(`Subscribed to account ${address} with subscription ID ${subscriptionId}`);

    return subscriptionId;
  }

  /**
   * Unsubscribe from account changes
   * @param subscriptionId Subscription ID to unsubscribe
   */
  public async unsubscribeFromAccount(subscriptionId: number): Promise<void> {
    const subscription = this.accountSubscriptions.get(subscriptionId);
    if (!subscription) {
      logger.warn(`No account subscription found for ID ${subscriptionId}`);
      return;
    }

    this.accountSubscriptions.delete(subscriptionId);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const unsubscribeMessage = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'accountUnsubscribe',
        params: [subscriptionId],
      };
      this.ws.send(JSON.stringify(unsubscribeMessage));
      logger.info(`Unsubscribed from account ${subscription.address} (subscription ID ${subscriptionId})`);
    }
  }

  /**
   * Disconnect and clean up all resources
   */
  public disconnect(): void {
    // Clean up WebSocket
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Clear all pending subscriptions
    for (const [_, subscription] of this.subscriptions) {
      clearTimeout(subscription.timeout);
      subscription.reject(new Error('Service disconnected'));
    }
    this.subscriptions.clear();

    // Clear all account subscriptions
    this.accountSubscriptions.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
      logger.info('Helius WebSocket disconnected');
    }
  }
}

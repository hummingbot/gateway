import WebSocket from 'ws';

import { logger } from '../services/logger';

import { RPCProvider, RPCProviderConfig, NetworkInfo, TransactionMonitorResult } from './rpc-provider-base';

interface WebSocketSubscription {
  signature: string;
  resolve: (result: TransactionMonitorResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
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
        | any;
    };
    subscription: number;
  };
  result?: number;
  id?: number;
  error?: any;
}

/**
 * Helius Service - Optimized RPC provider for Solana networks
 *
 * Features:
 * - WebSocket transaction monitoring (connects on-demand, disconnects after 30s idle)
 * - Support for mainnet-beta and devnet
 */
export class HeliusService extends RPCProvider {
  private subscriptions = new Map<number, WebSocketSubscription>();
  private nextSubscriptionId = 1;
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs = 30000;
  private connecting: Promise<void> | null = null;

  constructor(config: RPCProviderConfig, networkInfo: NetworkInfo) {
    super(config, networkInfo);
  }

  public override getHttpUrl(): string {
    const isDevnet = this.networkInfo.network.includes('devnet');
    const subdomain = isDevnet ? 'devnet' : 'mainnet';
    return `https://${subdomain}.helius-rpc.com/?api-key=${this.config.apiKey}`;
  }

  public getWebSocketUrl(): string | null {
    if (!this.isApiKeyValid()) return null;
    const isDevnet = this.networkInfo.network.includes('devnet');
    const subdomain = isDevnet ? 'devnet' : 'mainnet';
    return `wss://${subdomain}.helius-rpc.com/?api-key=${this.config.apiKey}`;
  }

  public async initialize(): Promise<void> {
    logger.info('Helius service initialized (WebSocket connects on-demand)');
  }

  /**
   * Check if transaction monitoring via WebSocket is supported
   */
  public override supportsTransactionMonitoring(): boolean {
    return this.isApiKeyValid();
  }

  /**
   * Monitor a transaction for confirmation via WebSocket
   */
  public override async monitorTransaction(
    signature: string,
    timeoutMs: number = 30000,
  ): Promise<TransactionMonitorResult> {
    const connected = await this.ensureWebSocketConnected();
    if (!connected) {
      throw new Error('WebSocket not available');
    }

    this.cancelIdleTimeout();

    return new Promise((resolve, reject) => {
      const subscriptionId = this.nextSubscriptionId++;

      const resolveWithCleanup = (result: TransactionMonitorResult) => {
        this.subscriptions.delete(subscriptionId);
        this.scheduleIdleDisconnect();
        resolve(result);
      };

      const rejectWithCleanup = (error: Error) => {
        this.subscriptions.delete(subscriptionId);
        this.scheduleIdleDisconnect();
        reject(error);
      };

      const timeout = setTimeout(() => {
        this.subscriptions.delete(subscriptionId);
        this.scheduleIdleDisconnect();
        resolve({ confirmed: false });
      }, timeoutMs);

      this.subscriptions.set(subscriptionId, {
        signature,
        resolve: resolveWithCleanup,
        reject: rejectWithCleanup,
        timeout,
      });

      const subscribeMessage = {
        jsonrpc: '2.0',
        id: subscriptionId,
        method: 'signatureSubscribe',
        params: [signature, { commitment: 'confirmed' }],
      };

      (this.ws as WebSocket).send(JSON.stringify(subscribeMessage));
      logger.info(`Monitoring transaction ${signature} via WebSocket`);
    });
  }

  public override isWebSocketConnected(): boolean {
    return this.ws !== null && (this.ws as WebSocket).readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    this.cancelIdleTimeout();

    for (const [_, subscription] of this.subscriptions) {
      clearTimeout(subscription.timeout);
      subscription.reject(new Error('Service disconnected'));
    }
    this.subscriptions.clear();

    if (this.ws) {
      (this.ws as WebSocket).close();
      this.ws = null;
      logger.info('Helius WebSocket disconnected');
    }
  }

  private async ensureWebSocketConnected(): Promise<boolean> {
    if (!this.isApiKeyValid()) {
      return false;
    }

    if (this.isWebSocketConnected()) {
      return true;
    }

    if (this.connecting) {
      try {
        await this.connecting;
        return this.isWebSocketConnected();
      } catch {
        return false;
      }
    }

    this.connecting = this.connectWebSocket();
    try {
      await this.connecting;
      return true;
    } catch (error: any) {
      logger.warn(`Failed to connect Helius WebSocket: ${error.message}`);
      return false;
    } finally {
      this.connecting = null;
    }
  }

  private async connectWebSocket(): Promise<void> {
    const wsUrl = this.getWebSocketUrl();
    if (!wsUrl) {
      throw new Error('WebSocket URL not available');
    }

    const isDevnet = this.networkInfo.network.includes('devnet');
    logger.info(`Connecting to Helius WebSocket (${isDevnet ? 'devnet' : 'mainnet'})`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          logger.info('Helius WebSocket connected');
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
          logger.error(`WebSocket error: ${error.message}`);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          logger.info(`WebSocket closed: code=${code}, reason=${reason?.toString()}`);
          this.ws = null;
          this.handleWebSocketClose();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    if (message.method === 'signatureNotification' && message.params) {
      const subscriptionId = message.params.subscription;
      const result = message.params.result;

      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        clearTimeout(subscription.timeout);
        this.subscriptions.delete(subscriptionId);

        // Server auto-unsubscribes after signatureNotification
        if (result && result.value && typeof result.value === 'object' && 'err' in result.value && result.value.err) {
          subscription.resolve({ confirmed: false, txData: result });
        } else {
          subscription.resolve({ confirmed: true, txData: result });
        }
      }
    } else if (message.result !== undefined && typeof message.id === 'number') {
      // Remap from local ID to server subscription ID
      const localId = message.id;
      const serverSubscriptionId = message.result;
      logger.debug(`Remapped subscription ${localId} -> ${serverSubscriptionId}`);

      const subscription = this.subscriptions.get(localId);
      if (subscription) {
        this.subscriptions.delete(localId);
        this.subscriptions.set(serverSubscriptionId, subscription);
      }
    } else if (message.error) {
      // Ignore expected "Invalid subscription id" errors
      if (message.error.code === -32602 && message.error.message?.includes('Invalid subscription')) {
        return;
      }

      logger.error(`WebSocket error: ${JSON.stringify(message.error)}`);
      const subscription = this.subscriptions.get(message.id!);
      if (subscription) {
        clearTimeout(subscription.timeout);
        this.subscriptions.delete(message.id!);
        subscription.reject(new Error(`WebSocket error: ${message.error.message}`));
      }
    }
  }

  private handleWebSocketClose(): void {
    for (const [_, subscription] of this.subscriptions) {
      clearTimeout(subscription.timeout);
      subscription.reject(new Error('WebSocket disconnected'));
    }
    this.subscriptions.clear();
    this.cancelIdleTimeout();
  }

  private scheduleIdleDisconnect(): void {
    if (this.subscriptions.size > 0) return;

    this.cancelIdleTimeout();
    this.idleTimeout = setTimeout(() => {
      if (this.subscriptions.size === 0 && this.ws) {
        logger.info('Closing idle Helius WebSocket');
        (this.ws as WebSocket).close();
        this.ws = null;
      }
    }, this.idleTimeoutMs);
  }

  private cancelIdleTimeout(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }
}

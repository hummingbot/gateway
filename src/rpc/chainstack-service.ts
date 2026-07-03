import { providers } from 'ethers';
import WebSocket from 'ws';

import { httpGet, httpPost } from '../services/http-client';
import { logger } from '../services/logger';

import { createRateLimitAwareEthereumProvider } from './rpc-connection-interceptor';
import { RPCProvider, RPCProviderConfig, NetworkInfo, TransactionMonitorResult } from './rpc-provider-base';

/** Raw node object returned by GET /v1/nodes */
interface ChainstackApiNode {
  id: string;
  name: string;
  network: string; // Network ID, e.g. "NW-056-237-8"
  status: string;
  configuration?: { client?: string };
  details: {
    https_endpoint: string;
    wss_endpoint: string;
    auth_key: string;
  };
}

/** Paginated response from GET /v1/nodes */
interface ChainstackNodesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ChainstackApiNode[];
}

/** Network object returned by GET /v1/networks/{id} */
interface ChainstackApiNetwork {
  id: string;
  protocol: string;
  configuration?: { network?: string };
}

/** Flattened node with resolved protocol/network and authenticated endpoints */
interface ChainstackNode {
  id: string;
  protocol: string;
  network: string;
  status: string;
  https_endpoint: string;
  wss_endpoint: string;
}

interface ChainstackMapping {
  protocol: string;
  network: string;
}

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
      context: { slot: number };
      value: { err: any } | string | any;
    };
    subscription: number;
  };
  result?: number;
  id?: number;
  error?: any;
}

/**
 * Chainstack Service - Multi-chain RPC provider
 *
 * Discovers deployed nodes via the Chainstack Platform API
 * (GET https://api.chainstack.com/v1/nodes) and maps the caller's gateway
 * chain/network to the matching Chainstack node's https/wss endpoints.
 *
 * Features:
 * - Solana + all gateway-supported EVM networks
 * - Auto-discovery (no URL templating)
 * - WebSocket transaction monitoring on Solana (signatureSubscribe)
 * - HTTP JsonRpcProvider for Ethereum (with rate-limit interceptor)
 */
export class ChainstackService extends RPCProvider {
  private static readonly API_BASE = 'https://api.chainstack.com/v1';
  private static readonly NODES_URL = `${ChainstackService.API_BASE}/nodes`;

  /**
   * Maps gateway (chain, network) → Chainstack (protocol, network).
   *
   * The Chainstack Platform API returns `protocol` and `network` fields on
   * every node; we use them to locate the node matching the caller's chain.
   */
  private static readonly NETWORK_MAP: Record<string, ChainstackMapping> = {
    'ethereum:mainnet': { protocol: 'ethereum', network: 'ethereum-mainnet' },
    'ethereum:arbitrum': { protocol: 'arbitrum', network: 'arbitrum-mainnet' },
    'ethereum:polygon': { protocol: 'polygon-pos', network: 'polygon-pos-mainnet' },
    'ethereum:optimism': { protocol: 'optimism', network: 'optimism-mainnet' },
    'ethereum:base': { protocol: 'base', network: 'base-mainnet' },
    'ethereum:avalanche': { protocol: 'avalanche', network: 'avalanche-mainnet' },
    'ethereum:bsc': { protocol: 'bsc', network: 'bsc-mainnet' },
    'ethereum:celo': { protocol: 'celo', network: 'celo-mainnet' },
    'ethereum:sepolia': { protocol: 'ethereum', network: 'ethereum-sepolia-testnet' },
    'solana:mainnet-beta': { protocol: 'solana', network: 'solana-mainnet' },
    'solana:devnet': { protocol: 'solana', network: 'solana-devnet' },
  };

  /**
   * List of (chain, network) pairs Chainstack discovery supports.
   * Exposed so smoke tests / tooling can iterate without redeclaring the list.
   */
  public static getSupportedNetworks(): Array<{ chain: 'solana' | 'ethereum'; network: string }> {
    return Object.keys(ChainstackService.NETWORK_MAP).map((key) => {
      const [chain, network] = key.split(':');
      return { chain: chain as 'solana' | 'ethereum', network };
    });
  }

  private selectedNode: ChainstackNode | null = null;
  private ethereumProvider: providers.StaticJsonRpcProvider | null = null;

  private subscriptions = new Map<number, WebSocketSubscription>();
  private nextSubscriptionId = 1;
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs = 30000;
  private connecting: Promise<void> | null = null;

  constructor(config: RPCProviderConfig, networkInfo: NetworkInfo) {
    super(config, networkInfo);
  }

  /**
   * Resolve the Chainstack protocol/network pair for the current gateway chain.
   * Throws when the combo is not mapped (Chainstack doesn't cover it).
   */
  private getMapping(): ChainstackMapping {
    const key = `${this.networkInfo.chain}:${this.networkInfo.network}`;
    const mapping = ChainstackService.NETWORK_MAP[key];
    if (!mapping) {
      throw new Error(`Chainstack network not supported for ${key}`);
    }
    return mapping;
  }

  /**
   * Build an authenticated endpoint URL by appending the auth_key path segment.
   */
  private static buildAuthUrl(baseUrl: string, authKey: string): string {
    // Strip trailing slash, append /{authKey}
    return `${baseUrl.replace(/\/+$/, '')}/${authKey}`;
  }

  /**
   * Resolve an API network ID (e.g. "NW-056-237-8") to its protocol and
   * configuration.network via GET /v1/networks/{id}.
   */
  private async resolveNetwork(networkId: string): Promise<ChainstackApiNetwork> {
    const url = `${ChainstackService.API_BASE}/networks/${networkId}`;
    const resp = await httpGet<ChainstackApiNetwork>(url, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      timeout: 10000,
    });
    return resp.data;
  }

  /**
   * Discover the caller's Chainstack node via the Platform API and cache it.
   *
   * Strategy:
   *  1. Fetch all nodes (paginated).
   *  2. Filter to running nodes.
   *  3. For each candidate, resolve the network to get protocol + network name.
   *  4. Pick the first node whose resolved protocol/network matches the mapping.
   *  5. Build authenticated endpoint URLs using details.auth_key.
   */
  public async initialize(): Promise<void> {
    if (!this.isApiKeyValid()) {
      throw new Error('Chainstack API key is missing or invalid');
    }

    const mapping = this.getMapping();

    const response = await httpGet<ChainstackNodesResponse>(ChainstackService.NODES_URL, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      timeout: 10000,
    });

    const results = Array.isArray(response.data)
      ? (response.data as unknown as ChainstackApiNode[])
      : response.data?.results;

    if (!Array.isArray(results)) {
      throw new Error('Chainstack API returned unexpected response shape');
    }

    const running = results.filter((n) => n.status === 'running');

    // Resolve each running node's network to match against the gateway mapping.
    // Cache resolved networks to avoid duplicate lookups.
    const networkCache = new Map<string, ChainstackApiNetwork>();
    let matched: ChainstackApiNode | null = null;
    let resolvedProtocol = '';
    let resolvedNetwork = '';

    for (const node of running) {
      let netInfo = networkCache.get(node.network);
      if (!netInfo) {
        try {
          netInfo = await this.resolveNetwork(node.network);
          networkCache.set(node.network, netInfo);
        } catch {
          continue; // skip nodes whose network can't be resolved
        }
      }
      const proto = netInfo.protocol || node.configuration?.client || '';
      const netName = netInfo.configuration?.network || '';

      if (proto === mapping.protocol && netName === mapping.network) {
        matched = node;
        resolvedProtocol = proto;
        resolvedNetwork = netName;
        break;
      }
    }

    if (!matched) {
      throw new Error(
        `No running Chainstack node found for ${this.networkInfo.chain}/${this.networkInfo.network} ` +
          `(protocol=${mapping.protocol}, network=${mapping.network})`,
      );
    }

    const authKey = matched.details.auth_key || '';
    this.selectedNode = {
      id: matched.id,
      protocol: resolvedProtocol,
      network: resolvedNetwork,
      status: matched.status,
      https_endpoint: authKey
        ? ChainstackService.buildAuthUrl(matched.details.https_endpoint, authKey)
        : matched.details.https_endpoint,
      wss_endpoint: authKey
        ? ChainstackService.buildAuthUrl(matched.details.wss_endpoint, authKey)
        : matched.details.wss_endpoint,
    };

    if (this.networkInfo.chain === 'ethereum') {
      this.ethereumProvider = createRateLimitAwareEthereumProvider(
        new providers.StaticJsonRpcProvider(this.selectedNode.https_endpoint, {
          name: mapping.network,
          chainId: this.networkInfo.chainId,
        }),
        this.selectedNode.https_endpoint,
      );
    }

    logger.info(
      `Chainstack service initialized: node ${this.selectedNode.id} (${this.selectedNode.protocol}/${this.selectedNode.network}) for ${this.networkInfo.chain}/${this.networkInfo.network}`,
    );
  }

  public override getHttpUrl(): string | null {
    return this.selectedNode?.https_endpoint ?? null;
  }

  public getWebSocketUrl(): string | null {
    if (!this.selectedNode) return null;
    return this.selectedNode.wss_endpoint || null;
  }

  /**
   * Ethereum-only: returns the cached HTTP provider wrapped with rate-limit interception.
   */
  public getProvider(): providers.StaticJsonRpcProvider {
    if (this.networkInfo.chain !== 'ethereum') {
      throw new Error('ChainstackService.getProvider() is Ethereum-only');
    }
    if (!this.ethereumProvider) {
      throw new Error('ChainstackService not initialized; call initialize() first');
    }
    return this.ethereumProvider;
  }

  public override supportsTransactionMonitoring(): boolean {
    return this.networkInfo.chain === 'solana' && this.getWebSocketUrl() !== null;
  }

  public override async monitorTransaction(
    signature: string,
    timeoutMs: number = 30000,
  ): Promise<TransactionMonitorResult> {
    if (this.networkInfo.chain !== 'solana') {
      throw new Error('ChainstackService transaction monitoring is Solana-only');
    }

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

  public override async healthCheck(): Promise<boolean> {
    if (!this.selectedNode) {
      logger.error('Chainstack health check failed: service not initialized');
      return false;
    }

    try {
      if (this.networkInfo.chain === 'ethereum') {
        await this.getProvider().getBlockNumber();
      } else {
        const response = await httpPost<{ result?: number; error?: { message?: string } }>(
          this.selectedNode.https_endpoint,
          { jsonrpc: '2.0', id: 1, method: 'getSlot' },
          { timeout: 5000 },
        );
        if (response.data.error) {
          throw new Error(response.data.error.message || 'getSlot failed');
        }
      }
      logger.debug(`Chainstack health check passed for ${this.networkInfo.chain}/${this.networkInfo.network}`);
      return true;
    } catch (error: any) {
      logger.error(
        `Chainstack health check failed for ${this.networkInfo.chain}/${this.networkInfo.network}: ${error.message}`,
      );
      return false;
    }
  }

  public disconnect(): void {
    this.cancelIdleTimeout();

    for (const [, subscription] of this.subscriptions) {
      clearTimeout(subscription.timeout);
      subscription.reject(new Error('Service disconnected'));
    }
    this.subscriptions.clear();

    if (this.ws) {
      (this.ws as WebSocket).close();
      this.ws = null;
      logger.info('Chainstack WebSocket disconnected');
    }
  }

  private async ensureWebSocketConnected(): Promise<boolean> {
    if (!this.isApiKeyValid()) return false;
    if (this.isWebSocketConnected()) return true;

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
      logger.warn(`Failed to connect Chainstack WebSocket: ${error.message}`);
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

    logger.info(`Connecting to Chainstack WebSocket (${this.networkInfo.chain}/${this.networkInfo.network})`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          logger.info('Chainstack WebSocket connected');
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

        this.ws.on('error', (error: Error) => {
          logger.error(`WebSocket error: ${error.message}`);
          reject(error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
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
      // Remap local id → server subscription id
      const localId = message.id;
      const serverSubscriptionId = message.result;
      logger.debug(`Remapped subscription ${localId} -> ${serverSubscriptionId}`);

      const subscription = this.subscriptions.get(localId);
      if (subscription) {
        this.subscriptions.delete(localId);
        this.subscriptions.set(serverSubscriptionId, subscription);
      }
    } else if (message.error) {
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
    for (const [, subscription] of this.subscriptions) {
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
        logger.info('Closing idle Chainstack WebSocket');
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

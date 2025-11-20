/**
 * GatewayAPI Client
 *
 * Typed API client for Gateway backend with organized endpoint methods.
 * Provides better IDE autocomplete, type safety, and cleaner code.
 *
 * @example
 * const api = new GatewayAPI();
 * const chains = await api.config.getChains();
 * const balances = await api.chains.getBalances('solana', 'mainnet-beta', walletAddress);
 */

import { gatewayGet, gatewayPost, gatewayDelete } from './api';
import type {
  // Chain types
  BalanceRequestType,
  BalanceResponseType,
  TokensResponseType,
  StatusResponseType,
  TransactionsResponseType,
  ParseResponseType,

  // CLMM types
  PositionInfo,
  CLMMPoolInfo,
  OpenPositionRequestType,
  OpenPositionResponseType,
  CollectFeesRequestType,
  CollectFeesResponseType,
  ClosePositionRequestType,
  ClosePositionResponseType,

  // Router types
  RouterQuoteRequest,
  RouterQuoteResponse,
  RouterExecuteRequest,
  RouterExecuteResponse,

  // Custom types
  TokenInfo,
  ConnectorConfig,
  PoolTemplate,
} from './gateway-types';

/**
 * Configuration API endpoints
 */
export class ConfigAPI {
  async getChains() {
    return gatewayGet<{ chains: Array<{ chain: string; networks: string[] }> }>('/config/chains');
  }

  async getConnectors() {
    return gatewayGet<{ connectors: ConnectorConfig[] }>('/config/connectors');
  }

  async getNamespaces() {
    return gatewayGet<{ namespaces: string[] }>('/config/namespaces');
  }

  async getAll() {
    return gatewayGet<Record<string, any>>('/config');
  }

  async update(namespace: string, path: string, value: any) {
    return gatewayPost('/config/update', { namespace, path, value });
  }
}

/**
 * Chain API endpoints (balances, tokens, status)
 */
export class ChainAPI {
  async getBalances(chain: string, params: BalanceRequestType) {
    return gatewayPost<BalanceResponseType>(`/chains/${chain}/balances`, params);
  }

  async getTokens(chain: string, network: string) {
    return gatewayGet<TokensResponseType>(`/chains/${chain}/tokens?network=${network}`);
  }

  async getStatus(chain: string, network: string) {
    return gatewayGet<StatusResponseType>(`/chains/${chain}/status?network=${network}`);
  }

  async getTransactions(chain: string, params: { network?: string; walletAddress?: string; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params.network) queryParams.append('network', params.network);
    if (params.walletAddress) queryParams.append('walletAddress', params.walletAddress);
    if (params.limit) queryParams.append('limit', String(params.limit));

    return gatewayGet<TransactionsResponseType>(`/chains/${chain}/transactions?${queryParams}`);
  }

  async parseTransaction(chain: string, params: { network?: string; signature: string; walletAddress?: string }) {
    return gatewayPost<ParseResponseType>(`/chains/${chain}/parse`, params);
  }
}

/**
 * Token management API endpoints
 */
export class TokenAPI {
  async save(address: string, chainNetwork: string) {
    return gatewayPost<{ message: string; token: TokenInfo }>(
      `/tokens/save/${address}?chainNetwork=${chainNetwork}`,
      {}
    );
  }

  async delete(address: string, chain: string, network: string) {
    return gatewayDelete(`/tokens/${address}?chain=${chain}&network=${network}`);
  }
}

/**
 * Pool API endpoints
 */
export class PoolAPI {
  async list(connector: string, network: string) {
    return gatewayGet<PoolTemplate[]>(`/pools?connector=${connector}&network=${network}`);
  }

  async getInfo(connector: string, chainNetwork: string, poolAddress: string) {
    return gatewayGet<CLMMPoolInfo>(
      `/trading/clmm/pool-info?connector=${connector}&chainNetwork=${chainNetwork}&poolAddress=${poolAddress}`
    );
  }

  async save(address: string, chainNetwork: string) {
    return gatewayPost<{ message: string; pool: PoolTemplate }>(
      `/pools/save/${address}?chainNetwork=${chainNetwork}`,
      {}
    );
  }
}

/**
 * CLMM (Concentrated Liquidity) API endpoints
 */
export class CLMMAPI {
  async getPositionsOwned(connector: string, chainNetwork: string, walletAddress: string) {
    return gatewayGet<PositionInfo[]>(
      `/trading/clmm/positions-owned?connector=${connector}&chainNetwork=${chainNetwork}&walletAddress=${walletAddress}`
    );
  }

  async openPosition(params: OpenPositionRequestType) {
    return gatewayPost<OpenPositionResponseType>('/trading/clmm/open', params);
  }

  async collectFees(connector: string, params: CollectFeesRequestType) {
    return gatewayPost<CollectFeesResponseType>(
      `/connectors/${connector}/clmm/collect-fees`,
      params
    );
  }

  async closePosition(connector: string, params: ClosePositionRequestType) {
    return gatewayPost<ClosePositionResponseType>(
      `/connectors/${connector}/clmm/close-position`,
      params
    );
  }
}

/**
 * Router (DEX aggregator) API endpoints
 */
export class RouterAPI {
  async quoteSwap(connector: string, params: Omit<RouterQuoteRequest, 'connector'>) {
    const queryParams = new URLSearchParams();
    if (params.network) queryParams.append('network', params.network);
    queryParams.append('baseToken', params.baseToken);
    queryParams.append('quoteToken', params.quoteToken);
    queryParams.append('amount', String(params.amount));
    queryParams.append('side', params.side);
    if (params.slippagePct !== undefined) queryParams.append('slippagePct', String(params.slippagePct));

    return gatewayGet<RouterQuoteResponse>(
      `/connectors/${connector}/router/quote-swap?${queryParams}`
    );
  }

  async executeSwap(connector: string, params: Omit<RouterExecuteRequest, 'connector'>) {
    return gatewayPost<RouterExecuteResponse>(
      `/connectors/${connector}/router/execute-swap`,
      params
    );
  }
}

/**
 * Trading API endpoints (unified CLMM routes)
 */
export class TradingAPI {
  async collectFees(params: { connector: string; chainNetwork: string; walletAddress: string; positionAddress: string }) {
    return gatewayPost<CollectFeesResponseType>('/trading/clmm/collect-fees', params);
  }

  async closePosition(params: { connector: string; chainNetwork: string; walletAddress: string; positionAddress: string }) {
    return gatewayPost<ClosePositionResponseType>('/trading/clmm/close', params);
  }
}

/**
 * Main Gateway API Client
 *
 * Organizes all API endpoints into logical namespaces.
 */
export class GatewayAPI {
  /** Configuration endpoints */
  config = new ConfigAPI();

  /** Chain endpoints (balances, tokens, status) */
  chains = new ChainAPI();

  /** Token management endpoints */
  tokens = new TokenAPI();

  /** Pool endpoints */
  pools = new PoolAPI();

  /** CLMM (Concentrated Liquidity) endpoints */
  clmm = new CLMMAPI();

  /** Router (DEX aggregator) endpoints */
  router = new RouterAPI();

  /** Trading endpoints (unified CLMM operations) */
  trading = new TradingAPI();
}

/**
 * Default singleton instance
 *
 * @example
 * import { gatewayAPI } from '@/lib/GatewayAPI';
 * const chains = await gatewayAPI.config.getChains();
 */
export const gatewayAPI = new GatewayAPI();

import axios, { AxiosInstance } from 'axios';

import { ConfigManagerV2 } from './config-manager-v2';
import { logger } from './logger';

/**
 * Chain network parsing info
 */
export interface ChainNetworkInfo {
  chain: string;
  network: string;
}

/**
 * DEX connector type definition
 */
export interface DexConnectorInfo {
  connector: string;
  type: 'amm' | 'clmm';
}

/**
 * Mapping from GeckoTerminal DEX IDs to Gateway connector names and types
 * This allows filtering pools by connector (raydium, meteora, etc) and type (amm, clmm)
 *
 * DEX IDs are from GeckoTerminal API: /api/v2/networks/{network}/dexes
 */
const DEX_CONNECTOR_MAPPING: Record<string, DexConnectorInfo> = {
  // Solana DEXes (from GeckoTerminal /networks/solana/dexes)
  raydium: { connector: 'raydium', type: 'amm' },
  'raydium-clmm': { connector: 'raydium', type: 'clmm' },
  meteora: { connector: 'meteora', type: 'clmm' },
  'pancakeswap-v3-solana': { connector: 'pancakeswap-sol', type: 'clmm' },

  // Ethereum DEXes
  uniswap_v2: { connector: 'uniswap', type: 'amm' },
  uniswap_v3: { connector: 'uniswap', type: 'clmm' },
  sushiswap: { connector: 'sushiswap', type: 'amm' },
  sushiswap_v3: { connector: 'sushiswap', type: 'clmm' },

  // BSC DEXes
  pancakeswap_v2: { connector: 'pancakeswap', type: 'amm' },
  'pancakeswap-v3-bsc': { connector: 'pancakeswap', type: 'clmm' },
  sushiswap_bsc: { connector: 'sushiswap', type: 'amm' },
};

/**
 * GeckoTerminal API pool data structure
 */
export interface GeckoTerminalPool {
  id: string;
  type: 'pool';
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    base_token_price_quote_token: string;
    quote_token_price_base_token: string;
    pool_created_at: string;
    reserve_in_usd: string;
    volume_usd: {
      h24: string;
    };
    price_change_percentage: {
      h24: string;
    };
    transactions: {
      h24: {
        buys: number;
        sells: number;
      };
    };
  };
  relationships: {
    base_token: {
      data: {
        id: string; // Format: "solana_So11111111111111111111111111111111111111112"
        type: 'token';
      };
    };
    quote_token: {
      data: {
        id: string;
        type: 'token';
      };
    };
    dex: {
      data: {
        id: string;
        type: 'dex';
      };
    };
  };
}

/**
 * Simplified pool info for top pools response
 * This contains raw data from GeckoTerminal API that can be transformed
 * to PoolGeckoData using extractRawPoolData() and toPoolGeckoData()
 */
export interface TopPoolInfo {
  poolAddress: string;
  dex: string;
  connector: string | null;
  type: 'amm' | 'clmm' | null;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string;
  // Fields below can be extracted and transformed to PoolGeckoData
  priceUsd: string;
  priceNative: string;
  volumeUsd24h: string;
  priceChange24h: string;
  liquidityUsd: string;
  txns24h: {
    buys: number;
    sells: number;
  };
}

/**
 * GeckoTerminal API token data structure
 */
export interface GeckoTerminalTokenData {
  id: string;
  type: 'token';
  attributes: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    image_url: string;
    coingecko_coin_id: string | null;
    websites: string[];
    description: string;
    gt_score: number;
    holders?: {
      count: number;
      distribution_percentage?: {
        top_10: string;
        [key: string]: string;
      };
      last_updated: string;
    };
  };
}

/**
 * Simplified token info response
 */
export interface GeckoTerminalTokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  imageUrl: string;
  coingeckoCoinId: string | null;
  websites: string[];
  description: string;
  gtScore: number;
  holders?: {
    count: number;
    topTenPercent?: string;
  };
}

/**
 * CoinGecko service for GeckoTerminal API integration
 */
export class CoinGeckoService {
  private static instance: CoinGeckoService;
  private client: AxiosInstance;
  private apiKey: string | undefined;
  private baseURL = 'https://api.geckoterminal.com/api/v2';

  private constructor() {
    const configManager = ConfigManagerV2.getInstance();
    this.apiKey = configManager.get('server.coingeckoAPIKey');

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        Accept: 'application/json',
        ...(this.apiKey && { 'X-CG-API-KEY': this.apiKey }),
      },
    });

    logger.info(`CoinGecko service initialized${this.apiKey ? ' with API key' : ' (no API key)'}`);
  }

  public static getInstance(): CoinGeckoService {
    if (!CoinGeckoService.instance) {
      CoinGeckoService.instance = new CoinGeckoService();
    }
    return CoinGeckoService.instance;
  }

  /**
   * Map Gateway chain-network format to GeckoTerminal network ID
   */
  public mapNetworkId(chainNetwork: string): string {
    const configManager = ConfigManagerV2.getInstance();
    return configManager.getGeckoTerminalId(chainNetwork);
  }

  /**
   * Parse Gateway chainNetwork format to get internal chain and network names
   * This handles special cases like 'ethereum-base' which should map to chain='ethereum', network='base'
   */
  public parseChainNetwork(chainNetwork: string): ChainNetworkInfo {
    const configManager = ConfigManagerV2.getInstance();
    return configManager.parseChainNetwork(chainNetwork);
  }

  /**
   * Extract token address from GeckoTerminal token ID
   * Format: "solana_So11111111111111111111111111111111111111112"
   */
  private extractTokenAddress(tokenId: string): string {
    const parts = tokenId.split('_');
    return parts.length > 1 ? parts[1] : tokenId;
  }

  /**
   * Extract token symbol from pool name
   * Format: "SOL / USDC" -> "SOL" for base, "USDC" for quote
   */
  private extractSymbol(poolName: string, isBase: boolean): string {
    const parts = poolName.split(' / ');
    if (parts.length !== 2) {
      return 'UNKNOWN';
    }
    return isBase ? parts[0].trim() : parts[1].trim();
  }

  /**
   * Get DEX connector info from GeckoTerminal DEX ID
   */
  private getDexConnectorInfo(dexId: string): DexConnectorInfo {
    const connectorInfo = DEX_CONNECTOR_MAPPING[dexId];
    if (connectorInfo) {
      return connectorInfo;
    }
    // Return null values for unknown DEXes
    return { connector: null as any, type: null as any };
  }

  /**
   * Validate token address format based on chain type to prevent SSRF
   */
  private isValidTokenAddress(chainNetwork: string, tokenAddress: string): boolean {
    // EVM chains: 0x followed by 40 hex characters
    const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;
    // Solana addresses: base58, typically 32-44 chars, only base58 alphabet
    const SOLANA_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

    // Determine chain type from chainNetwork
    const chain = chainNetwork.split('-')[0];

    if (chain === 'ethereum') {
      return EVM_REGEX.test(tokenAddress);
    } else if (chain === 'solana') {
      return SOLANA_REGEX.test(tokenAddress);
    }

    // Reject unknown chains
    return false;
  }

  /**
   * Get top pools for a token with optional connector and type filtering
   * Fetches multiple pages from GeckoTerminal (up to maxPages)
   */
  public async getTopPoolsForToken(
    chainNetwork: string,
    tokenAddress: string,
    maxPages: number = 10,
    connector?: string,
    type?: 'amm' | 'clmm',
  ): Promise<TopPoolInfo[]> {
    try {
      // Validate token address before constructing endpoint to prevent SSRF
      if (!this.isValidTokenAddress(chainNetwork, tokenAddress)) {
        logger.warn(`Invalid token address supplied: ${tokenAddress} for chainNetwork: ${chainNetwork}`);
        throw new Error(`Invalid token address format for chainNetwork "${chainNetwork}"`);
      }

      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/tokens/${tokenAddress}/pools`;

      logger.info(
        `Fetching pools for token ${tokenAddress} on ${chainNetwork} (max pages: ${maxPages})${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
      );

      const allPools: GeckoTerminalPool[] = [];

      // Fetch multiple pages from GeckoTerminal
      for (let page = 1; page <= maxPages; page++) {
        try {
          const response = await this.client.get<{ data: GeckoTerminalPool[] }>(endpoint, {
            params: {
              page,
            },
          });

          if (!response.data || !response.data.data || response.data.data.length === 0) {
            logger.debug(`No more pools found at page ${page}`);
            break;
          }

          allPools.push(...response.data.data);
        } catch (pageError: any) {
          logger.debug(`Failed to fetch page ${page}: ${pageError.message}`);
          break;
        }
      }

      if (allPools.length === 0) {
        logger.warn(`No pools found for token ${tokenAddress} on ${chainNetwork}`);
        return [];
      }

      // Transform pools
      let pools = allPools.map((pool) => this.transformPool(pool));

      // Filter by connector if specified
      if (connector) {
        pools = pools.filter((pool) => pool.connector === connector);
        logger.debug(`Filtered to ${pools.length} pools with connector: ${connector}`);
      }

      // Filter by type if specified
      if (type) {
        pools = pools.filter((pool) => pool.type === type);
        logger.debug(`Filtered to ${pools.length} pools with type: ${type}`);
      }

      logger.info(
        `Found ${pools.length} pools for token ${tokenAddress} (from ${allPools.length} total across ${Math.min(maxPages, allPools.length > 0 ? Math.ceil(allPools.length / 20) : 0)} pages)`,
      );

      return pools;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Token ${tokenAddress} not found on ${chainNetwork}`);
        return [];
      }

      logger.error(`Error fetching pools from GeckoTerminal: ${error.message}`);
      throw new Error(`Failed to fetch pools from GeckoTerminal: ${error.message}`);
    }
  }

  /**
   * Get top pools for a network with optional connector and type filtering
   * Fetches multiple pages from GeckoTerminal (up to maxPages)
   */
  public async getTopPoolsByNetwork(
    chainNetwork: string,
    maxPages: number = 3,
    connector?: string,
    type?: 'amm' | 'clmm',
  ): Promise<TopPoolInfo[]> {
    try {
      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/pools`;

      logger.info(
        `Fetching top pools for network ${chainNetwork} (max pages: ${maxPages})${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
      );

      const allPools: GeckoTerminalPool[] = [];

      // Fetch multiple pages from GeckoTerminal
      for (let page = 1; page <= maxPages; page++) {
        try {
          const response = await this.client.get<{ data: GeckoTerminalPool[] }>(endpoint, {
            params: {
              page,
            },
          });

          if (!response.data || !response.data.data || response.data.data.length === 0) {
            logger.debug(`No more pools found at page ${page}`);
            break;
          }

          allPools.push(...response.data.data);
        } catch (pageError: any) {
          logger.debug(`Failed to fetch page ${page}: ${pageError.message}`);
          break;
        }
      }

      if (allPools.length === 0) {
        logger.warn(`No pools found for network ${chainNetwork}`);
        return [];
      }

      // Transform pools
      let pools = allPools.map((pool) => this.transformPool(pool));

      // Filter by connector if specified
      if (connector) {
        pools = pools.filter((pool) => pool.connector === connector);
        logger.debug(`Filtered to ${pools.length} pools with connector: ${connector}`);
      }

      // Filter by type if specified
      if (type) {
        pools = pools.filter((pool) => pool.type === type);
        logger.debug(`Filtered to ${pools.length} pools with type: ${type}`);
      }

      logger.info(`Found ${pools.length} pools for network ${chainNetwork} (from ${allPools.length} total)`);

      return pools;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Network ${chainNetwork} not found`);
        return [];
      }

      logger.error(`Error fetching pools from GeckoTerminal: ${error.message}`);
      throw new Error(`Failed to fetch pools from GeckoTerminal: ${error.message}`);
    }
  }

  /**
   * Transform GeckoTerminal pool to TopPoolInfo
   */
  private transformPool(pool: GeckoTerminalPool): TopPoolInfo {
    const baseTokenAddress = this.extractTokenAddress(pool.relationships.base_token.data.id);
    const quoteTokenAddress = this.extractTokenAddress(pool.relationships.quote_token.data.id);
    const dexId = pool.relationships.dex.data.id;
    const connectorInfo = this.getDexConnectorInfo(dexId);

    return {
      poolAddress: pool.attributes.address,
      dex: dexId,
      connector: connectorInfo.connector,
      type: connectorInfo.type,
      baseTokenAddress,
      quoteTokenAddress,
      baseTokenSymbol: this.extractSymbol(pool.attributes.name, true),
      quoteTokenSymbol: this.extractSymbol(pool.attributes.name, false),
      priceUsd: pool.attributes.base_token_price_usd,
      priceNative: pool.attributes.base_token_price_quote_token,
      volumeUsd24h: pool.attributes.volume_usd.h24,
      priceChange24h: pool.attributes.price_change_percentage.h24,
      liquidityUsd: pool.attributes.reserve_in_usd,
      txns24h: {
        buys: pool.attributes.transactions.h24.buys,
        sells: pool.attributes.transactions.h24.sells,
      },
    };
  }

  /**
   * Get token info from GeckoTerminal
   */
  public async getTokenInfo(chainNetwork: string, tokenAddress: string): Promise<GeckoTerminalTokenInfo> {
    try {
      // Validate token address before constructing endpoint to prevent SSRF
      if (!this.isValidTokenAddress(chainNetwork, tokenAddress)) {
        logger.warn(`Invalid token address supplied: ${tokenAddress} for chainNetwork: ${chainNetwork}`);
        throw new Error(`Invalid token address format for chainNetwork "${chainNetwork}"`);
      }

      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/tokens/${tokenAddress}/info`;

      logger.info(`Fetching token info for ${tokenAddress} on ${chainNetwork}`);

      const response = await this.client.get<{ data: GeckoTerminalTokenData }>(endpoint);

      if (!response.data || !response.data.data) {
        throw new Error(`No token info found for ${tokenAddress} on ${geckoNetwork}`);
      }

      const tokenData = response.data.data;
      const attrs = tokenData.attributes;

      return {
        address: attrs.address,
        name: attrs.name,
        symbol: attrs.symbol,
        decimals: attrs.decimals,
        imageUrl: attrs.image_url,
        coingeckoCoinId: attrs.coingecko_coin_id,
        websites: attrs.websites,
        description: attrs.description,
        gtScore: attrs.gt_score,
        holders: attrs.holders
          ? {
              count: attrs.holders.count,
              topTenPercent: attrs.holders.distribution_percentage?.top_10,
            }
          : undefined,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Token ${tokenAddress} not found on ${chainNetwork}`);
      }

      logger.error(`Error fetching token info from GeckoTerminal: ${error.message}`);
      throw new Error(`Failed to fetch token info from GeckoTerminal: ${error.message}`);
    }
  }

  /**
   * Get token info with market data including price, volume, market cap, and top pools
   * This uses the extended endpoint that includes top_pools relationship
   *
   * The market data fields in the return value can be transformed to TokenGeckoData
   * using toTokenGeckoData() helper from gecko-types.ts
   */
  public async getTokenInfoWithMarketData(
    chainNetwork: string,
    tokenAddress: string,
  ): Promise<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    // Fields below can be transformed to TokenGeckoData using toTokenGeckoData()
    coingeckoCoinId: string | null;
    imageUrl: string;
    priceUsd: string;
    volumeUsd24h: string;
    marketCapUsd: string;
    fdvUsd: string;
    totalSupply: string;
    topPools: string[];
  }> {
    try {
      // Validate token address before constructing endpoint to prevent SSRF
      if (!this.isValidTokenAddress(chainNetwork, tokenAddress)) {
        logger.warn(`Invalid token address supplied: ${tokenAddress} for chainNetwork: ${chainNetwork}`);
        throw new Error(`Invalid token address format for chainNetwork "${chainNetwork}"`);
      }

      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/tokens/${tokenAddress}`;

      logger.info(`Fetching token info with market data for ${tokenAddress} on ${chainNetwork}`);

      const response = await this.client.get<{
        data: {
          id: string;
          type: 'token';
          attributes: {
            address: string;
            name: string;
            symbol: string;
            decimals: number;
            image_url: string;
            coingecko_coin_id: string | null;
            price_usd: string;
            volume_usd: { h24: string };
            market_cap_usd: string;
            fdv_usd: string;
            total_supply: string;
            normalized_total_supply: string;
          };
          relationships: {
            top_pools: {
              data: Array<{ id: string; type: 'pool' }>;
            };
          };
        };
      }>(endpoint, {
        params: {
          include: 'top_pools',
        },
      });

      if (!response.data || !response.data.data) {
        throw new Error(`No token info found for ${tokenAddress} on ${geckoNetwork}`);
      }

      const tokenData = response.data.data;
      const attrs = tokenData.attributes;
      const topPoolsData = tokenData.relationships?.top_pools?.data || [];

      // Extract pool addresses from top_pools relationship
      const topPools = topPoolsData.map((pool) => {
        // Format: "solana_58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
        const parts = pool.id.split('_');
        return parts.length > 1 ? parts[1] : pool.id;
      });

      return {
        address: attrs.address,
        name: attrs.name,
        symbol: attrs.symbol,
        decimals: attrs.decimals,
        coingeckoCoinId: attrs.coingecko_coin_id,
        imageUrl: attrs.image_url,
        priceUsd: attrs.price_usd,
        volumeUsd24h: attrs.volume_usd.h24,
        marketCapUsd: attrs.market_cap_usd,
        fdvUsd: attrs.fdv_usd,
        totalSupply: attrs.normalized_total_supply,
        topPools,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Token ${tokenAddress} not found on ${chainNetwork}`);
      }

      logger.error(`Error fetching token info from GeckoTerminal: ${error.message}`);
      throw new Error(`Failed to fetch token info from GeckoTerminal: ${error.message}`);
    }
  }

  /**
   * Get pool info from GeckoTerminal by pool address
   */
  public async getPoolInfo(chainNetwork: string, poolAddress: string): Promise<TopPoolInfo> {
    try {
      // Validate pool address before constructing endpoint to prevent SSRF
      if (!this.isValidTokenAddress(chainNetwork, poolAddress)) {
        logger.warn(`Invalid pool address supplied: ${poolAddress} for chainNetwork: ${chainNetwork}`);
        throw new Error(`Invalid pool address format for chainNetwork "${chainNetwork}"`);
      }

      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/pools/${poolAddress}`;

      logger.info(`Fetching pool info for ${poolAddress} on ${chainNetwork}`);

      const response = await this.client.get<{ data: GeckoTerminalPool }>(endpoint);

      if (!response.data || !response.data.data) {
        throw new Error(`No pool info found for ${poolAddress} on ${geckoNetwork}`);
      }

      const pool = response.data.data;
      return this.transformPool(pool);
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Pool ${poolAddress} not found on ${chainNetwork}`);
      }

      logger.error(`Error fetching pool info from GeckoTerminal: ${error.message}`);
      throw new Error(`Failed to fetch pool info from GeckoTerminal: ${error.message}`);
    }
  }

  /**
   * Get list of supported networks
   */
  public getSupportedNetworks(): string[] {
    const configManager = ConfigManagerV2.getInstance();
    return configManager.getSupportedChainNetworks();
  }
}

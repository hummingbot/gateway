import axios, { AxiosInstance } from 'axios';

import { ConfigManagerV2 } from './config-manager-v2';
import { logger } from './logger';

/**
 * Network mapping from Gateway chain-network format to GeckoTerminal network IDs
 */
const NETWORK_MAPPING: Record<string, string> = {
  // Ethereum networks
  'ethereum-mainnet': 'eth',
  'ethereum-sepolia': 'sepolia-testnet',

  // Solana networks
  'solana-mainnet-beta': 'solana',
  'solana-devnet': 'solana', // GeckoTerminal doesn't have devnet

  // BSC networks
  'bsc-mainnet': 'bsc',

  // Polygon networks
  'polygon-mainnet': 'polygon_pos',
  'polygon-zkevm': 'polygon-zkevm',

  // Arbitrum networks
  'arbitrum-mainnet': 'arbitrum',
  'arbitrum-nova': 'arbitrum_nova',

  // Optimism networks
  'optimism-mainnet': 'optimism',

  // Base networks
  'base-mainnet': 'base',

  // Avalanche networks
  'avalanche-mainnet': 'avax',

  // Celo networks
  'celo-mainnet': 'celo',
};

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
 */
const DEX_CONNECTOR_MAPPING: Record<string, DexConnectorInfo> = {
  // Solana DEXes
  raydium: { connector: 'raydium', type: 'amm' },
  'raydium-clmm': { connector: 'raydium', type: 'clmm' },
  meteora: { connector: 'meteora', type: 'clmm' },
  'meteora-dlmm': { connector: 'meteora', type: 'clmm' },
  orca: { connector: 'orca', type: 'clmm' },
  'orca-whirlpools': { connector: 'orca', type: 'clmm' },
  'pancakeswap-v3-solana': { connector: 'pancakeswap-sol', type: 'clmm' },

  // Ethereum DEXes
  'uniswap-v2': { connector: 'uniswap', type: 'amm' },
  'uniswap-v3': { connector: 'uniswap', type: 'clmm' },
  'pancakeswap-v2': { connector: 'pancakeswap', type: 'amm' },
  'pancakeswap-v3': { connector: 'pancakeswap', type: 'clmm' },
  sushiswap: { connector: 'sushiswap', type: 'amm' },
  'sushiswap-v3': { connector: 'sushiswap', type: 'clmm' },
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
    const geckoNetwork = NETWORK_MAPPING[chainNetwork];
    if (!geckoNetwork) {
      throw new Error(`Unsupported network for GeckoTerminal: ${chainNetwork}`);
    }
    return geckoNetwork;
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
   * Get top pools for a token with optional connector and type filtering
   */
  public async getTopPoolsForToken(
    chainNetwork: string,
    tokenAddress: string,
    limit: number = 10,
    connector?: string,
    type?: 'amm' | 'clmm',
  ): Promise<TopPoolInfo[]> {
    try {
      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/tokens/${tokenAddress}/pools`;

      logger.info(
        `Fetching top ${limit} pools for token ${tokenAddress} on ${geckoNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
      );

      const response = await this.client.get<{ data: GeckoTerminalPool[] }>(endpoint, {
        params: {
          page: 1,
        },
      });

      if (!response.data || !response.data.data) {
        logger.warn(`No pools found for token ${tokenAddress} on ${geckoNetwork}`);
        return [];
      }

      // Transform pools
      let pools = response.data.data.map((pool) => this.transformPool(pool));

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

      // Apply limit after filtering
      pools = pools.slice(0, limit);

      logger.info(`Found ${pools.length} pools for token ${tokenAddress}`);

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
      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/tokens/${tokenAddress}/info`;

      logger.info(`Fetching token info for ${tokenAddress} on ${geckoNetwork}`);

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
   * Get list of supported networks
   */
  public getSupportedNetworks(): string[] {
    return Object.keys(NETWORK_MAPPING);
  }
}

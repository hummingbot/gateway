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
   * Get top pools for a token
   */
  public async getTopPoolsForToken(
    chainNetwork: string,
    tokenAddress: string,
    limit: number = 10,
  ): Promise<TopPoolInfo[]> {
    try {
      const geckoNetwork = this.mapNetworkId(chainNetwork);
      const endpoint = `/networks/${geckoNetwork}/tokens/${tokenAddress}/pools`;

      logger.info(`Fetching top ${limit} pools for token ${tokenAddress} on ${geckoNetwork}`);

      const response = await this.client.get<{ data: GeckoTerminalPool[] }>(endpoint, {
        params: {
          page: 1,
        },
      });

      if (!response.data || !response.data.data) {
        logger.warn(`No pools found for token ${tokenAddress} on ${geckoNetwork}`);
        return [];
      }

      // Transform and limit results
      const pools = response.data.data.slice(0, limit).map((pool) => this.transformPool(pool));

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

    return {
      poolAddress: pool.attributes.address,
      dex: pool.relationships.dex.data.id,
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
   * Get list of supported networks
   */
  public getSupportedNetworks(): string[] {
    return Object.keys(NETWORK_MAPPING);
  }
}

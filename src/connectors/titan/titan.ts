import { Solana } from '../../chains/solana/solana';
import { createHttpClient, HttpClient, HttpClientError } from '../../services/http-client';
import { logger } from '../../services/logger';

import { TitanConfig } from './titan.config';
import { TitanApiInstruction } from './titan.utils';

// Titan DART swap API base URL (https://titan-exchange.gitbook.io/titan/developer-doc/dart-swap-api)
// Public tier: no API key, 1 request/second per IP, JSON responses.
const TITAN_API_BASE = 'https://api.titan.exchange';
const DART_SWAP_PATH = '/dart/swap';

// Type definitions for the Titan DART swap API response
export interface TitanSwapResponse {
  provider: string;
  inputAmount: string | number;
  outputAmount: string | number;
  slippageBps: number;
  instructions: TitanApiInstruction[];
  addressLookupTables: string[];
}

export class Titan {
  private static _instances: { [name: string]: Titan };
  private solana: Solana;
  public config: TitanConfig.RootConfig;
  private httpClient: HttpClient;

  private constructor() {
    this.config = TitanConfig.config;
    this.solana = null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey && this.config.apiKey.length > 0) {
      headers['X-API-Key'] = this.config.apiKey;
      logger.info('Using Titan DART API with key');
    } else {
      logger.warn(
        'No Titan API key configured. Using the public DART endpoint, which is limited to ' +
          '1 request/second per IP. Set titan.apiKey for production use.',
      );
    }

    this.httpClient = createHttpClient({
      baseURL: TITAN_API_BASE,
      timeout: 30000,
      headers,
    });
  }

  /**
   * Gets or creates a singleton instance of Titan for the specified network
   */
  public static async getInstance(network: string): Promise<Titan> {
    if (!Titan._instances) {
      Titan._instances = {};
    }
    if (!Titan._instances[network]) {
      const instance = new Titan();
      await instance.init(network);
      Titan._instances[network] = instance;
    }
    return Titan._instances[network];
  }

  private async init(network: string): Promise<void> {
    try {
      this.solana = await Solana.getInstance(network);
      logger.info('Initialized Titan for network:', network);
    } catch (error) {
      logger.error('Failed to initialize Titan:', error);
      throw error;
    }
  }

  /**
   * Gets an executable swap route (quote + instructions) from the Titan DART API.
   * DART quotes are wallet-bound: the instructions are built for userPublicKey.
   * ExactIn only — DART has no ExactOut mode.
   *
   * @param inputMint Input token mint address
   * @param outputMint Output token mint address
   * @param amountRaw Input amount in smallest units
   * @param userPublicKey Wallet the instructions are built for
   * @param slippageBps Slippage tolerance in basis points
   */
  async getSwapRoute(
    inputMint: string,
    outputMint: string,
    amountRaw: string,
    userPublicKey: string,
    slippageBps: number,
  ): Promise<TitanSwapResponse> {
    const swapRequest: Record<string, any> = {
      inputMint,
      outputMint,
      amount: amountRaw,
      userPublicKey,
      slippageBps,
    };
    if (this.config.computeUnitPrice > 0) {
      swapRequest.computeUnitPrice = Math.floor(this.config.computeUnitPrice);
    }

    logger.info(
      `Titan DART swap route: ${inputMint} -> ${outputMint}, amountRaw=${amountRaw}, slippageBps=${slippageBps}`,
    );

    try {
      const response = await this.httpClient.post<TitanSwapResponse>(DART_SWAP_PATH, swapRequest);
      const route = response.data;
      if (!route || !route.instructions || route.instructions.length === 0) {
        throw new Error('Titan DART returned no instructions for this swap');
      }
      return route;
    } catch (error) {
      if (error instanceof HttpClientError) {
        logger.error('Titan API error:', error.message);
        const data = error.response?.data;
        if (data) {
          logger.error('Titan API error response:', data);
          const apiMessage = typeof data === 'string' ? data : data.error || data.message || JSON.stringify(data);
          if (error.status === 429) {
            throw new Error(
              `Titan rate limit exceeded (public tier is 1 req/s; set titan.apiKey for higher limits): ${apiMessage}`,
            );
          }
          throw new Error(`Titan API error: ${apiMessage}`);
        }
      }
      throw error;
    }
  }
}

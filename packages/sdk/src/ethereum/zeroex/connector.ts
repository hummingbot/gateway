/**
 * 0x SDK Connector
 *
 * Core connector class for interacting with 0x API.
 * Provides low-level methods for price quotes and firm quotes.
 */

import axios, { AxiosInstance } from 'axios';
import { BigNumber } from 'ethers';

import { ZeroXConfig, PriceParams, PriceResponse, QuoteParams, QuoteResponse } from './types';

export class ZeroXConnector {
  private client: AxiosInstance;
  private config: ZeroXConfig;

  constructor(config: ZeroXConfig) {
    this.config = config;

    if (!config.apiKey) {
      throw new Error('0x API key not configured');
    }

    this.client = axios.create({
      baseURL: config.apiEndpoint,
      timeout: 30000,
      headers: {
        '0x-api-key': config.apiKey,
        '0x-version': 'v2',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get indicative price quote (no commitment)
   */
  async getPrice(params: PriceParams): Promise<PriceResponse> {
    try {
      const queryParams: any = {
        chainId: this.config.chainId,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        takerAddress: params.takerAddress,
      };

      if (params.sellAmount) {
        queryParams.sellAmount = params.sellAmount;
      } else if (params.buyAmount) {
        queryParams.buyAmount = params.buyAmount;
      } else {
        throw new Error('Either sellAmount or buyAmount must be specified');
      }

      if (params.slippagePercentage !== undefined) {
        queryParams.slippagePercentage = params.slippagePercentage;
      }

      if (params.skipValidation !== undefined) {
        queryParams.skipValidation = params.skipValidation;
      }

      if (params.affiliateAddress) {
        queryParams.affiliateAddress = params.affiliateAddress;
      }

      const response = await this.client.get<PriceResponse>('/swap/permit2/price', { params: queryParams });

      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        throw new Error(
          `0x API Error: ${error.response.data.reason || error.response.data.message || JSON.stringify(error.response.data)}`,
        );
      }
      throw error;
    }
  }

  /**
   * Get firm quote (ready for execution)
   */
  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    try {
      const queryParams: any = {
        chainId: this.config.chainId,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        takerAddress: params.takerAddress,
      };

      if (params.sellAmount) {
        queryParams.sellAmount = params.sellAmount;
      } else if (params.buyAmount) {
        queryParams.buyAmount = params.buyAmount;
      } else {
        throw new Error('Either sellAmount or buyAmount must be specified');
      }

      if (params.slippagePercentage !== undefined) {
        queryParams.slippagePercentage = params.slippagePercentage;
      }

      if (params.skipValidation !== undefined) {
        queryParams.skipValidation = params.skipValidation;
      }

      if (params.affiliateAddress) {
        queryParams.affiliateAddress = params.affiliateAddress;
      }

      const response = await this.client.get<QuoteResponse>('/swap/permit2/quote', { params: queryParams });

      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        throw new Error(
          `0x API Error: ${error.response.data.reason || error.response.data.message || JSON.stringify(error.response.data)}`,
        );
      }
      throw error;
    }
  }

  /**
   * Format token amount from smallest unit to decimal
   */
  formatTokenAmount(amount: string, decimals: number): string {
    const bigNumberAmount = BigNumber.from(amount);
    const divisor = BigNumber.from(10).pow(decimals);
    const beforeDecimal = bigNumberAmount.div(divisor);
    const afterDecimal = bigNumberAmount.mod(divisor);

    if (afterDecimal.isZero()) {
      return beforeDecimal.toString();
    }

    const afterDecimalStr = afterDecimal.toString().padStart(decimals, '0');
    const trimmed = afterDecimalStr.replace(/0+$/, '');

    return `${beforeDecimal}.${trimmed}`;
  }

  /**
   * Parse token amount from decimal to smallest unit
   */
  parseTokenAmount(amount: number, decimals: number): string {
    const multiplier = BigNumber.from(10).pow(decimals);
    const amountStr = amount.toFixed(decimals);
    const [whole, decimal = ''] = amountStr.split('.');
    const paddedDecimal = decimal.padEnd(decimals, '0');
    const combined = whole + paddedDecimal;
    return combined.replace(/^0+/, '') || '0';
  }

  /**
   * Get slippage percentage from config
   */
  get slippagePct(): number {
    return this.config.slippagePct;
  }
}

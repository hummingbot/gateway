import { BigNumber } from 'ethers';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { createHttpClient, HttpClient, HttpClientError } from '../../services/http-client';
import { logger } from '../../services/logger';

import { ZeroXConfig } from './0x.config';

export interface ZeroXQuoteParams {
  sellToken: string;
  buyToken: string;
  sellAmount?: string;
  buyAmount?: string;
  takerAddress: string;
  slippagePercentage?: number;
  skipValidation?: boolean;
  affiliateAddress?: string;
}

export interface ZeroXPriceResponse {
  chainId: number;
  price: string;
  estimatedPriceImpact: string;
  value: string;
  gasPrice: string;
  gas: string;
  estimatedGas: string;
  protocolFee: string;
  minimumProtocolFee: string;
  buyTokenAddress: string;
  buyAmount: string;
  sellTokenAddress: string;
  sellAmount: string;
  sources: Array<{ name: string; proportion: string }>;
  allowanceTarget: string;
  sellTokenToEthRate: string;
  buyTokenToEthRate: string;
  expectedSlippage: string | null;
}

export interface ZeroXQuoteResponse extends ZeroXPriceResponse {
  guaranteedPrice: string;
  to: string;
  data: string;
  orders: any[];
  fees: {
    zeroExFee: {
      feeType: string;
      feeToken: string;
      feeAmount: string;
      billingType: string;
    };
  };
  auxiliaryChainData: any;
}

export class ZeroX {
  private static instances: Map<string, ZeroX> = new Map();
  private client: HttpClient;
  private apiKey: string;
  private _slippagePct: number;

  private constructor(
    private network: string,
    private chainId: number,
  ) {
    // Load configuration from ConfigManager
    this.apiKey = ZeroXConfig.config.apiKey;
    this._slippagePct = ZeroXConfig.config.slippagePct;

    // Check if API key is configured
    if (!this.apiKey) {
      throw new Error('0x API key not configured. Please add your API key to conf/connectors/0x.yml');
    }

    const apiEndpoint = ZeroXConfig.getApiEndpoint(network);

    this.client = createHttpClient({
      baseURL: apiEndpoint,
      timeout: ConfigManagerV2.getInstance().get('0x.requestTimeout') || 30000,
      headers: {
        '0x-api-key': this.apiKey,
        '0x-version': 'v2',
        'Content-Type': 'application/json',
      },
      enableLogging: ConfigManagerV2.getInstance().get('0x.enableLogging'),
    });
  }

  public static async getInstance(network: string): Promise<ZeroX> {
    if (!ZeroX.instances.has(network)) {
      // Get chain ID from Ethereum configuration
      const ethereum = await Ethereum.getInstance(network);
      const chainId = ethereum.chainId;

      ZeroX.instances.set(network, new ZeroX(network, chainId));
    }
    return ZeroX.instances.get(network)!;
  }

  public async getPrice(params: ZeroXQuoteParams): Promise<ZeroXPriceResponse> {
    try {
      const queryParams: any = {
        chainId: this.chainId,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        takerAddress: params.takerAddress,
      };

      // Only one of sellAmount or buyAmount should be specified
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

      const response = await this.client.get<ZeroXPriceResponse>('/swap/permit2/price', { params: queryParams });

      return response.data;
    } catch (error: any) {
      if (error instanceof HttpClientError && error.response?.data) {
        logger.error(`0x API Error Response: ${JSON.stringify(error.response.data)}`);
        throw new Error(
          `0x API Error: ${error.response.data.reason || error.response.data.message || JSON.stringify(error.response.data)}`,
        );
      }
      throw error;
    }
  }

  public async getQuote(params: ZeroXQuoteParams): Promise<ZeroXQuoteResponse> {
    try {
      const queryParams: any = {
        chainId: this.chainId,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        takerAddress: params.takerAddress,
      };

      // Only one of sellAmount or buyAmount should be specified
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

      const response = await this.client.get<ZeroXQuoteResponse>('/swap/permit2/quote', { params: queryParams });

      return response.data;
    } catch (error: any) {
      if (error instanceof HttpClientError && error.response?.data) {
        logger.error(`0x API Error Response: ${JSON.stringify(error.response.data)}`);
        throw new Error(
          `0x API Error: ${error.response.data.reason || error.response.data.message || JSON.stringify(error.response.data)}`,
        );
      }
      throw error;
    }
  }

  public get slippagePct(): number {
    return this._slippagePct;
  }

  public get gasPriceBuffer(): number {
    // Hardcoded default for now
    return 1.2;
  }

  public formatTokenAmount(amount: string, decimals: number): string {
    const bigNumberAmount = BigNumber.from(amount);
    const divisor = BigNumber.from(10).pow(decimals);
    const beforeDecimal = bigNumberAmount.div(divisor);
    const afterDecimal = bigNumberAmount.mod(divisor);

    if (afterDecimal.isZero()) {
      return beforeDecimal.toString();
    }

    // Format with proper decimal places
    const afterDecimalStr = afterDecimal.toString().padStart(decimals, '0');
    const trimmed = afterDecimalStr.replace(/0+$/, '');

    return `${beforeDecimal}.${trimmed}`;
  }

  public parseTokenAmount(amount: number, decimals: number): string {
    // Convert a decimal amount to the token's smallest unit
    const multiplier = BigNumber.from(10).pow(decimals);
    const amountStr = amount.toFixed(decimals);
    const [whole, decimal = ''] = amountStr.split('.');
    const paddedDecimal = decimal.padEnd(decimals, '0');
    const combined = whole + paddedDecimal;
    return combined.replace(/^0+/, '') || '0';
  }
}

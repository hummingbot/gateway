import { BigNumber, utils } from 'ethers';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { createHttpClient, HttpClient, HttpClientError } from '../../services/http-client';
import { logger } from '../../services/logger';

import { FibrousRouterABI } from './fibrous.abi';
import { FibrousConfig } from './fibrous.config';

/** Address Fibrous uses to represent a chain's native coin (ETH, HYPE, MON). */
export const FIBROUS_NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Gas limit used when the Fibrous API does not return a usable estimate.
 * Aggregator routes can span several pools, so this is deliberately generous.
 */
const DEFAULT_GAS_LIMIT = '500000';

/** Scale used for integer percentage math on wei values (parts per million). */
const PPM = 1_000_000;

/**
 * Fraction of the trade size used as the "spot rate" reference when measuring
 * price impact. A hundredth of the trade is small enough to barely move the
 * pools while still being large enough to route on most pairs.
 */
const PRICE_IMPACT_REFERENCE_DIVISOR = 100;

export interface FibrousToken {
  address: string;
  name: string;
  decimals: number;
  price: number;
  extra_data: any;
}

export interface FibrousRouteParams {
  tokenInAddress: string;
  tokenOutAddress: string;
  /** Amount of tokenIn, in the token's smallest unit. */
  amount: string;
  slippagePct?: number;
}

export interface FibrousRouteSuccess {
  success: true;
  routeId: string;
  inputToken: FibrousToken;
  inputAmount: string;
  outputToken: FibrousToken;
  outputAmount: string;
  estimatedGasUsed: string;
  estimatedGasUsedInUsd: number;
  route: Array<{ percent: string; swaps: any[][] }>;
  time: number;
  meta?: { apiVersion: string; timestamp: string };
}

/** `route` tuple of the router's `swap` entrypoint, as returned by the API. */
export interface FibrousEvmRouteParam {
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  min_received: string;
  destination: string;
  swap_type: number;
}

/** One element of the `swap_parameters` tuple array. */
export interface FibrousEvmSwapParam {
  token_in: string;
  token_out: string;
  rate: string | number;
  protocol_id: string | number;
  pool_address: string;
  swap_type: number;
  extra_data: string;
}

export interface FibrousCalldataResponse {
  routeId: string;
  route: FibrousEvmRouteParam;
  swap_parameters: FibrousEvmSwapParam[];
  router_address: string;
  meta?: { apiVersion: string; timestamp: string };
}

/** An unsigned transaction ready to be sent by an ethers Wallet. */
export interface FibrousSwapTransaction {
  to: string;
  data: string;
  value: string;
}

export class Fibrous {
  private static instances: Map<string, Fibrous> = new Map();
  private client: HttpClient;
  private routerInterface: utils.Interface;
  private _slippagePct: number;

  private constructor(
    private network: string,
    private chainId: number,
  ) {
    this._slippagePct = FibrousConfig.config.slippagePct;

    const apiKey = FibrousConfig.config.apiKey;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // An API key is optional: it unlocks integrator fees and higher rate limits.
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    this.client = createHttpClient({
      baseURL: FibrousConfig.getApiEndpoint(network),
      timeout: ConfigManagerV2.getInstance().get('fibrous.requestTimeout') || 30000,
      headers,
      enableLogging: ConfigManagerV2.getInstance().get('fibrous.enableLogging'),
    });

    this.routerInterface = new utils.Interface(FibrousRouterABI as any);
  }

  public static async getInstance(network: string): Promise<Fibrous> {
    if (!Fibrous.instances.has(network)) {
      const ethereum = await Ethereum.getInstance(network);
      Fibrous.instances.set(network, new Fibrous(network, ethereum.chainId));
    }
    return Fibrous.instances.get(network)!;
  }

  /**
   * Fetches the best exact-input route from the Fibrous API.
   */
  public async getRoute(params: FibrousRouteParams): Promise<FibrousRouteSuccess> {
    const queryParams: Record<string, string | number> = {
      amount: params.amount,
      tokenInAddress: params.tokenInAddress,
      tokenOutAddress: params.tokenOutAddress,
      slippage: params.slippagePct ?? this._slippagePct,
    };

    try {
      const response = await this.client.get<FibrousRouteSuccess | { success: false; errorMessage: string }>('/route', {
        params: queryParams,
      });

      const data = response.data as any;
      if (!data?.success) {
        throw new Error(`Fibrous API Error: ${data?.errorMessage || 'no route found'}`);
      }

      return data as FibrousRouteSuccess;
    } catch (error: any) {
      throw this.wrapApiError(error);
    }
  }

  /**
   * Turns a route into router calldata parameters.
   *
   * @param slippagePct Slippage tolerance as a percentage (1 = 1%)
   * @param destination Address that receives the output token
   */
  public async getCalldata(
    route: FibrousRouteSuccess,
    slippagePct: number,
    destination: string,
  ): Promise<FibrousCalldataResponse> {
    try {
      const response = await this.client.post<FibrousCalldataResponse>('/calldata', {
        route,
        slippage: slippagePct,
        destination,
      });

      const data = response.data;
      if (!data?.route || !data?.swap_parameters || !data?.router_address) {
        throw new Error('Fibrous API Error: calldata response is missing route, swap parameters or router address');
      }

      return data;
    } catch (error: any) {
      throw this.wrapApiError(error);
    }
  }

  /**
   * ABI-encodes the router's `swap` call from a calldata response.
   *
   * The Fibrous API returns the swap arguments as structured objects rather
   * than pre-encoded calldata, so encoding happens here.
   */
  public buildSwapTransaction(calldata: FibrousCalldataResponse): FibrousSwapTransaction {
    const { route, swap_parameters: swapParameters, router_address: routerAddress } = calldata;

    const routeTuple = [
      route.token_in,
      route.token_out,
      BigNumber.from(route.amount_in),
      BigNumber.from(route.amount_out),
      BigNumber.from(route.min_received),
      route.destination,
      route.swap_type,
    ];

    const swapTuples = swapParameters.map((swap) => [
      swap.token_in,
      swap.token_out,
      BigNumber.from(swap.rate),
      BigNumber.from(swap.protocol_id),
      swap.pool_address,
      swap.swap_type,
      swap.extra_data,
    ]);

    const data = this.routerInterface.encodeFunctionData('swap', [routeTuple, swapTuples]);

    // Native-coin swaps must forward the input amount as transaction value.
    const isNativeInput = route.token_in.toLowerCase() === FIBROUS_NATIVE_TOKEN_ADDRESS;
    const value = isNativeInput ? BigNumber.from(route.amount_in).toString() : '0';

    return { to: utils.getAddress(routerAddress), data, value };
  }

  /**
   * Measures price impact for a route.
   *
   * The Fibrous API does not report price impact, and the USD reference prices
   * it returns per token are too noisy to derive it from (the implied figure
   * does not even grow with trade size). Instead the execution rate is compared
   * against the rate of a much smaller trade on the same pair, which is the
   * marginal "spot" rate.
   *
   * Returns 0 when the reference trade is too small to route.
   */
  public async getPriceImpactPct(route: FibrousRouteSuccess): Promise<number> {
    const executedIn = BigNumber.from(route.inputAmount);
    const executedOut = BigNumber.from(route.outputAmount);
    const referenceAmount = executedIn.div(PRICE_IMPACT_REFERENCE_DIVISOR);

    if (referenceAmount.isZero() || executedIn.isZero() || executedOut.isZero()) {
      return 0;
    }

    let reference: FibrousRouteSuccess;
    try {
      reference = await this.getRoute({
        tokenInAddress: route.inputToken.address,
        tokenOutAddress: route.outputToken.address,
        amount: referenceAmount.toString(),
      });
    } catch (error: any) {
      logger.debug(`Fibrous price impact reference route unavailable: ${error.message}`);
      return 0;
    }

    const referenceIn = BigNumber.from(reference.inputAmount);
    const referenceOut = BigNumber.from(reference.outputAmount);
    if (referenceIn.isZero() || referenceOut.isZero()) {
      return 0;
    }

    // impact = 1 - (executedOut / executedIn) / (referenceOut / referenceIn)
    const numerator = executedOut.mul(referenceIn);
    const denominator = executedIn.mul(referenceOut);
    if (denominator.isZero()) {
      return 0;
    }

    const impactPpm = BigNumber.from(PPM).sub(numerator.mul(PPM).div(denominator));
    const impactPct = impactPpm.toNumber() / (PPM / 100);

    // Negative values mean the reference route was simply priced differently;
    // treat those as no measurable impact.
    return Math.max(0, impactPct);
  }

  /**
   * Gas limit to use for a route.
   *
   * Note that the API's `estimatedGasUsed` field cannot be used here: it is
   * zero on Base and reports the fee in native wei (not a gas unit count) on
   * HyperEVM and Monad, so feeding it to `gasLimit` would produce an
   * unusable transaction. Callers can override this with `maxGas`.
   */
  public getGasEstimate(_route: FibrousRouteSuccess): string {
    return DEFAULT_GAS_LIMIT;
  }

  public get slippagePct(): number {
    return this._slippagePct;
  }

  public get networkChainId(): number {
    return this.chainId;
  }

  /** Converts a smallest-unit amount into a human-readable decimal string. */
  public formatTokenAmount(amount: string, decimals: number): string {
    return utils.formatUnits(BigNumber.from(amount), decimals);
  }

  /** Converts a decimal amount into the token's smallest unit. */
  public parseTokenAmount(amount: number, decimals: number): string {
    return utils.parseUnits(amount.toFixed(decimals), decimals).toString();
  }

  /** Normalizes Fibrous API errors into a single readable Error. */
  private wrapApiError(error: any): Error {
    if (error instanceof HttpClientError && error.response?.data) {
      const data = error.response.data;
      logger.error(`Fibrous API Error Response: ${JSON.stringify(data)}`);
      return new Error(`Fibrous API Error: ${data.message || data.errorMessage || JSON.stringify(data)}`);
    }
    if (error?.message?.startsWith('Fibrous API Error')) {
      return error;
    }
    return error;
  }
}

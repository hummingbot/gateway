import { BaseProvider } from '@ethersproject/providers';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { AlphaRouter, SwapRoute, SwapType } from '@uniswap/smart-order-router';
import { UniversalRouterVersion } from '@uniswap/universal-router-sdk';

import { logger } from '../../services/logger';

// Chain IDs as numbers (matching @uniswap/sdk-core ChainId enum values)
const NETWORK_TO_CHAIN_ID: { [network: string]: number } = {
  mainnet: 1,
  goerli: 5,
  sepolia: 11155111,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  base: 8453,
  bsc: 56,
  avalanche: 43114,
  celo: 42220,
};

export interface AlphaRouterQuoteResult {
  route: SwapRoute;
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  routeString: string;
  gasEstimate: string;
  gasEstimateUSD: string;
  methodParameters?: {
    calldata: string;
    value: string;
    to: string;
  };
}

export class AlphaRouterService {
  private router: AlphaRouter;
  private chainId: number;
  private network: string;

  constructor(provider: BaseProvider, network: string) {
    const chainId = NETWORK_TO_CHAIN_ID[network];
    if (!chainId) {
      throw new Error(`Unsupported network for AlphaRouter: ${network}`);
    }

    this.chainId = chainId;
    this.network = network;

    // Initialize AlphaRouter with minimal config
    // It will use default providers for pools, quotes, etc.
    this.router = new AlphaRouter({
      chainId: this.chainId,
      provider: provider,
    });

    logger.info(`[AlphaRouter] Initialized for network ${network} (chainId: ${chainId})`);
  }

  /**
   * Get an optimized quote using AlphaRouter's smart order routing
   * This will automatically find the best route across V2, V3, and mixed pools
   * with optimal split routing for better execution prices.
   */
  async getQuote(
    tokenIn: Token,
    tokenOut: Token,
    amount: CurrencyAmount<Token>,
    tradeType: TradeType,
    options: {
      slippageTolerance: Percent;
      deadline: number;
      recipient: string;
    },
  ): Promise<AlphaRouterQuoteResult> {
    logger.info(`[AlphaRouter] Starting quote generation`);
    logger.info(`[AlphaRouter] Input: ${amount.toExact()} ${tokenIn.symbol} (${tokenIn.address})`);
    logger.info(`[AlphaRouter] Output: ${tokenOut.symbol} (${tokenOut.address})`);
    logger.info(`[AlphaRouter] Trade type: ${tradeType === TradeType.EXACT_INPUT ? 'EXACT_INPUT' : 'EXACT_OUTPUT'}`);
    logger.info(`[AlphaRouter] Recipient: ${options.recipient}`);
    logger.info(`[AlphaRouter] Slippage: ${options.slippageTolerance.toSignificant()}%`);

    const swapRoute = await this.router.route(amount, tokenOut, tradeType, {
      type: SwapType.UNIVERSAL_ROUTER,
      version: UniversalRouterVersion.V2_0,
      slippageTolerance: options.slippageTolerance,
      deadlineOrPreviousBlockhash: options.deadline,
      recipient: options.recipient,
    });

    if (!swapRoute) {
      throw new Error(`No route found for ${tokenIn.symbol} -> ${tokenOut.symbol}`);
    }

    logger.info(`[AlphaRouter] Route found!`);
    logger.info(`[AlphaRouter] Quote: ${swapRoute.quote.toExact()} ${swapRoute.quote.currency.symbol}`);
    logger.info(`[AlphaRouter] Gas estimate: ${swapRoute.estimatedGasUsed.toString()}`);
    logger.info(`[AlphaRouter] Gas estimate USD: $${swapRoute.estimatedGasUsedUSD.toExact()}`);

    // Log route details (split routing info)
    const routeStrings: string[] = [];
    for (const route of swapRoute.route) {
      const routeStr = route.tokenPath.map((t) => t.symbol).join(' -> ');
      const percent = route.percent;
      routeStrings.push(`${percent}% via ${routeStr}`);
      logger.info(`[AlphaRouter] Route: ${percent}% via ${routeStr}`);
    }

    // Extract method parameters for Universal Router execution
    let methodParameters: AlphaRouterQuoteResult['methodParameters'];
    if (swapRoute.methodParameters) {
      methodParameters = {
        calldata: swapRoute.methodParameters.calldata,
        value: swapRoute.methodParameters.value,
        to: swapRoute.methodParameters.to,
      };
      logger.info(`[AlphaRouter] Calldata length: ${methodParameters.calldata.length}`);
      logger.info(`[AlphaRouter] Value: ${methodParameters.value}`);
      logger.info(`[AlphaRouter] To: ${methodParameters.to}`);
    }

    const result: AlphaRouterQuoteResult = {
      route: swapRoute,
      inputAmount: tradeType === TradeType.EXACT_INPUT ? amount.toExact() : swapRoute.quote.toExact(),
      outputAmount: tradeType === TradeType.EXACT_INPUT ? swapRoute.quote.toExact() : amount.toExact(),
      priceImpact: parseFloat(swapRoute.trade?.priceImpact?.toSignificant(4) || '0'),
      routeString: routeStrings.join(' | '),
      gasEstimate: swapRoute.estimatedGasUsed.toString(),
      gasEstimateUSD: swapRoute.estimatedGasUsedUSD.toExact(),
      methodParameters,
    };

    logger.info(`[AlphaRouter] Quote generation complete`);
    logger.info(`[AlphaRouter] Input: ${result.inputAmount} ${tokenIn.symbol}`);
    logger.info(`[AlphaRouter] Output: ${result.outputAmount} ${tokenOut.symbol}`);
    logger.info(`[AlphaRouter] Price Impact: ${result.priceImpact}%`);
    logger.info(`[AlphaRouter] Routes: ${result.routeString}`);

    return result;
  }
}

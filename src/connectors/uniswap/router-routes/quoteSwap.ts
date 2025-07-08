import { Static } from '@sinclair/typebox';
import { CurrencyAmount, Percent, TradeType, Token } from '@uniswap/sdk-core';
import {
  AlphaRouter,
  SwapOptionsSwapRouter02,
  SwapType,
} from '@uniswap/smart-order-router';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  QuoteSwapRequestType,
  QuoteSwapResponse,
} from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { UniswapQuoteSwapRequest, UniswapQuoteSwapResponse } from '../schemas';
import { Uniswap } from '../uniswap';

// Simple in-memory cache for quotes
export const quoteCache = new Map<
  string,
  {
    quote: any;
    request: any;
    timestamp: number;
  }
>();

// Clean up old quotes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, cached] of quoteCache.entries()) {
    if (now - cached.timestamp > 300000) {
      // 5 minutes
      quoteCache.delete(id);
    }
  }
}, 300000);

async function quoteSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
  protocols?: string[],
): Promise<Static<typeof UniswapQuoteSwapResponse>> {
  const ethereum = await Ethereum.getInstance(network);
  const uniswap = await Uniswap.getInstance(network);

  // Resolve token symbols to token objects
  const baseTokenInfo = ethereum.getTokenBySymbol(baseToken);
  const quoteTokenInfo = ethereum.getTokenBySymbol(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.notFound(
      sanitizeErrorMessage(
        'Token not found: {}',
        !baseTokenInfo ? baseToken : quoteToken,
      ),
    );
  }

  // Convert to Uniswap SDK Token objects
  const baseTokenObj = new Token(
    ethereum.chainId,
    baseTokenInfo.address,
    baseTokenInfo.decimals,
    baseTokenInfo.symbol,
    baseTokenInfo.name,
  );

  const quoteTokenObj = new Token(
    ethereum.chainId,
    quoteTokenInfo.address,
    quoteTokenInfo.decimals,
    quoteTokenInfo.symbol,
    quoteTokenInfo.name,
  );

  // Determine input/output based on side
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn
    ? [baseTokenObj, quoteTokenObj]
    : [quoteTokenObj, baseTokenObj];

  logger.info(
    `Getting executable quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Create AlphaRouter instance
  const router = new AlphaRouter({
    chainId: ethereum.chainId,
    provider: ethereum.provider,
  });

  // Convert amount to token units
  let tradeAmount: CurrencyAmount<Token>;
  if (exactIn) {
    const scaleFactor = Math.pow(10, inputToken.decimals);
    const rawAmount = Math.floor(amount * scaleFactor).toString();
    tradeAmount = CurrencyAmount.fromRawAmount(inputToken, rawAmount);
  } else {
    const scaleFactor = Math.pow(10, outputToken.decimals);
    const rawAmount = Math.floor(amount * scaleFactor).toString();
    tradeAmount = CurrencyAmount.fromRawAmount(outputToken, rawAmount);
  }

  // Configure swap options with actual wallet address
  const swapOptions: SwapOptionsSwapRouter02 = {
    recipient: walletAddress,
    slippageTolerance: new Percent(Math.floor(slippagePct * 100), 10000),
    deadline: Math.floor(Date.now() / 1000 + 1800), // 30 minutes
    type: SwapType.SWAP_ROUTER_02,
  };

  // Get quote from router
  const routeResponse = await router.route(
    tradeAmount,
    outputToken,
    exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    swapOptions,
  );

  if (!routeResponse || !routeResponse.methodParameters) {
    throw fastify.httpErrors.notFound('No routes found for this token pair');
  }

  const quote = routeResponse;

  // Generate unique quote ID
  const quoteId = uuidv4();

  // Extract route information
  const route: string[] = [];
  let routePath = '';

  if (quote.route && quote.route.length > 0) {
    const firstRoute = quote.route[0];
    if (firstRoute.tokenPath) {
      firstRoute.tokenPath.forEach((currency) => {
        if ('address' in currency) {
          route.push(currency.symbol || currency.address);
        } else {
          route.push('ETH'); // Native currency
        }
      });
      routePath = route.join(' -> ');
    }
  }

  // Calculate amounts based on quote
  let estimatedAmountIn: number;
  let estimatedAmountOut: number;

  if (exactIn) {
    estimatedAmountIn = amount;
    estimatedAmountOut = quote.quote ? parseFloat(quote.quote.toExact()) : 0;
  } else {
    estimatedAmountIn = quote.quote ? parseFloat(quote.quote.toExact()) : 0;
    estimatedAmountOut = amount;
  }

  const minAmountOut =
    side === 'SELL'
      ? estimatedAmountOut * (1 - slippagePct / 100)
      : estimatedAmountOut;
  const maxAmountIn =
    side === 'BUY'
      ? estimatedAmountIn * (1 + slippagePct / 100)
      : estimatedAmountIn;

  const price = estimatedAmountOut / estimatedAmountIn;
  // Calculate price with slippage
  // For SELL: worst price = minAmountOut / estimatedAmountIn (minimum quote per base)
  // For BUY: worst price = maxAmountIn / estimatedAmountOut (maximum quote per base)
  const priceWithSlippage =
    side === 'SELL'
      ? minAmountOut / estimatedAmountIn
      : maxAmountIn / estimatedAmountOut;
  const priceImpactPct = quote.estimatedGasUsedQuoteToken
    ? parseFloat(quote.estimatedGasUsedQuoteToken.toExact()) * 100
    : 0;

  // Cache the quote for execution
  quoteCache.set(quoteId, {
    quote: {
      ...quote,
      methodParameters: quote.methodParameters,
    },
    request: {
      network,
      walletAddress,
      baseTokenInfo,
      quoteTokenInfo,
      inputToken,
      outputToken,
      amount,
      side,
      slippagePct,
    },
    timestamp: Date.now(),
  });

  logger.info(
    `Quote ${quoteId}: ${estimatedAmountIn} ${inputToken.symbol} -> ${estimatedAmountOut} ${outputToken.symbol}`,
  );

  return {
    // Base QuoteSwapResponse fields in correct order
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    slippagePct,
    priceWithSlippage,
    minAmountOut,
    maxAmountIn,
    // Uniswap-specific fields
    priceImpactPct,
    gasEstimate: quote.estimatedGasUsed?.toString() || '0',
    expirationTime: Date.now() + 300000, // 5 minutes
    route,
    routePath,
    protocols: protocols || ['v2', 'v3'],
    methodParameters: quote.methodParameters,
    gasPriceWei: quote.gasPriceWei?.toString() || '0',
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof UniswapQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description:
          'Get an executable swap quote from Uniswap Smart Order Router',
        tags: ['/connector/uniswap'],
        querystring: {
          ...UniswapQuoteSwapRequest,
          properties: {
            ...UniswapQuoteSwapRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: UniswapQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          protocols,
          enableUniversalRouter,
        } = request.query as typeof UniswapQuoteSwapRequest._type;

        return await quoteSwap(
          fastify,
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          protocols,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error getting quote:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

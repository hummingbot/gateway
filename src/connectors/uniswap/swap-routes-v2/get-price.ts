import { CurrencyAmount, Percent, TradeType, Token } from '@uniswap/sdk-core';
import {
  AlphaRouter,
  SwapOptionsSwapRouter02,
  SwapRoute,
  SwapType,
} from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetPriceRequestType,
  GetPriceResponseType,
  GetPriceResponse,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Uniswap } from '../uniswap';

import { UniswapGetPriceRequest } from './schemas';

async function getPrice(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  protocols?: string[],
): Promise<GetPriceResponseType> {
  const ethereum = await Ethereum.getInstance(network);
  const uniswap = await Uniswap.getInstance(network);

  // Resolve token symbols to token objects
  const baseTokenInfo = ethereum.getTokenBySymbol(baseToken);
  const quoteTokenInfo = ethereum.getTokenBySymbol(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
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
    `Getting price quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
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

  // Configure swap options for price quote
  const swapOptions: SwapOptionsSwapRouter02 = {
    recipient: ethers.constants.AddressZero,
    slippageTolerance: new Percent(100, 10000), // 1% for price quote
    deadline: Math.floor(Date.now() / 1000 + 1800),
    type: SwapType.SWAP_ROUTER_02,
  };

  // Get quote from router
  const routeResponse = await router.route(
    tradeAmount,
    outputToken,
    exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    swapOptions,
  );

  if (!routeResponse || !routeResponse.route) {
    throw fastify.httpErrors.notFound('No routes found for this token pair');
  }

  const quote = routeResponse;

  // Extract route information
  const route: string[] = [];
  let routePath = '';

  if (quote.route && quote.route.length > 0) {
    const firstRoute = quote.route[0];
    if (firstRoute.tokenPath) {
      firstRoute.tokenPath.forEach((currency) => {
        // Handle both Token and Currency types
        if (currency && typeof currency === 'object') {
          const symbol = (currency as any).symbol;
          const address = (currency as any).address;
          if (symbol) {
            route.push(symbol);
          } else if (address) {
            route.push(address);
          } else {
            route.push('ETH'); // Native currency
          }
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

  const price = estimatedAmountOut / estimatedAmountIn;
  const priceImpactPct = quote.estimatedGasUsedQuoteToken
    ? parseFloat(quote.estimatedGasUsedQuoteToken.toExact()) * 100
    : 0;

  logger.info(
    `Price quote: ${estimatedAmountIn} ${inputToken.symbol} -> ${estimatedAmountOut} ${outputToken.symbol} (price: ${price})`,
  );

  const result: GetPriceResponseType = {
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    price,
    estimatedAmountIn,
    estimatedAmountOut,
    priceImpactPct,
    tokenInAmount: estimatedAmountIn,
    tokenOutAmount: estimatedAmountOut,
  };

  // Add Uniswap-specific fields
  return {
    ...result,
    network,
    baseToken: baseTokenInfo.symbol,
    quoteToken: quoteTokenInfo.symbol,
    amount,
    side,
    route,
    routePath,
    protocols: protocols || ['v2', 'v3'],
  } as GetPriceResponseType;
}

export const getPriceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPriceRequestType;
    Reply: GetPriceResponseType;
  }>(
    '/get-price',
    {
      schema: {
        description:
          'Get an indicative price quote for a token swap on Uniswap',
        tags: ['/connector/uniswap'],
        querystring: {
          ...UniswapGetPriceRequest,
          properties: {
            ...UniswapGetPriceRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
          },
        },
        response: { 200: GetPriceResponse },
      },
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, protocols } =
          request.query as typeof UniswapGetPriceRequest._type;

        return await getPrice(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          protocols,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error getting price:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default getPriceRoute;

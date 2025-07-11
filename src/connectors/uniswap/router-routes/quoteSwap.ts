import { Static } from '@sinclair/typebox';
import { Protocol } from '@uniswap/router-sdk';
import { CurrencyAmount, Percent, TradeType, Token } from '@uniswap/sdk-core';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { QuoteSwapRequestType, QuoteSwapResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { UniswapQuoteSwapRequest, UniswapQuoteSwapResponse } from '../schemas';
import { Uniswap } from '../uniswap';
import { UniversalRouterService } from '../universal-router';

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
  const baseTokenInfo = ethereum.getToken(baseToken);
  const quoteTokenInfo = ethereum.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.notFound(
      sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
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
  const [inputToken, outputToken] = exactIn ? [baseTokenObj, quoteTokenObj] : [quoteTokenObj, baseTokenObj];

  logger.info(`Getting Universal Router quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`);

  // Create Universal Router service
  const universalRouter = new UniversalRouterService(ethereum.provider, ethereum.chainId, network);

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

  // Map protocol strings to Protocol enum
  const protocolsToUse = protocols?.map((p) => {
    switch (p.toLowerCase()) {
      case 'v2':
        return Protocol.V2;
      case 'v3':
        return Protocol.V3;
      case 'v4':
        return Protocol.V4;
      default:
        return Protocol.V3;
    }
  }) || [Protocol.V2, Protocol.V3]; // V4 requires different approach

  // Get quote from Universal Router
  const quoteResult = await universalRouter.getQuote(
    inputToken,
    outputToken,
    tradeAmount,
    exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    {
      slippageTolerance: new Percent(Math.floor(slippagePct * 100), 10000),
      deadline: Math.floor(Date.now() / 1000 + 1800), // 30 minutes
      recipient: walletAddress,
      protocols: protocolsToUse,
    },
  );

  // Generate unique quote ID
  const quoteId = uuidv4();

  // Extract route information from quoteResult
  const route = quoteResult.route;
  const routePath = quoteResult.routePath;

  // Calculate amounts based on quote
  let estimatedAmountIn: number;
  let estimatedAmountOut: number;

  if (exactIn) {
    estimatedAmountIn = amount;
    estimatedAmountOut = parseFloat(quoteResult.quote.toExact());
  } else {
    estimatedAmountIn = parseFloat(quoteResult.trade.inputAmount.toExact());
    estimatedAmountOut = amount;
  }

  const minAmountOut = side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : estimatedAmountOut;
  const maxAmountIn = side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : estimatedAmountIn;

  const price = estimatedAmountOut / estimatedAmountIn;
  // Calculate price with slippage
  // For SELL: worst price = minAmountOut / estimatedAmountIn (minimum quote per base)
  // For BUY: worst price = maxAmountIn / estimatedAmountOut (maximum quote per base)
  const priceWithSlippage = side === 'SELL' ? minAmountOut / estimatedAmountIn : maxAmountIn / estimatedAmountOut;

  // Cache the quote for execution
  // Store both quote and request data in the quote object for Uniswap
  const cachedQuote = {
    quote: {
      ...quoteResult,
      methodParameters: quoteResult.methodParameters,
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
  };

  quoteCache.set(quoteId, cachedQuote);

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
    priceImpactPct: quoteResult.priceImpact,
    gasEstimate: quoteResult.estimatedGasUsed.toString(),
    expirationTime: Date.now() + 300000, // 5 minutes
    route,
    routePath,
    protocols: protocols || ['v2', 'v3'],
    methodParameters: quoteResult.methodParameters,
    gasPriceWei: '0', // We can add this later if needed
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
        description: 'Get an executable swap quote from Uniswap Universal Router',
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
            protocols: {
              type: 'array',
              items: { type: 'string' },
              examples: [['v2', 'v3', 'v4']],
              description: 'Protocols to use for routing (v2, v3, v4)',
            },
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

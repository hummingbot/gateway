import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ETCSwap } from '../etcSwap';
import { ETCSwapConfig } from '../etcSwap.config';
import { ETCSwapQuoteSwapRequest, ETCSwapQuoteSwapResponse } from '../schemas';

async function quoteSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
): Promise<Static<typeof ETCSwapQuoteSwapResponse>> {
  const ethereum = await Ethereum.getInstance(network);
  const etcSwap = await ETCSwap.getInstance(network);

  // Resolve token symbols to token objects
  const baseTokenInfo = ethereum.getToken(baseToken);
  const quoteTokenInfo = ethereum.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.notFound(
      sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
    );
  }

  // Convert to ETCSwap SDK Token objects
  const baseTokenObj = etcSwap.getETCSwapToken(baseTokenInfo);
  const quoteTokenObj = etcSwap.getETCSwapToken(quoteTokenInfo);

  // Determine input/output based on side
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn ? [baseTokenObj, quoteTokenObj] : [quoteTokenObj, baseTokenObj];

  // Get quote from Universal Router
  const quoteResult = await etcSwap.getUniversalRouterQuote(inputToken, outputToken, amount, side, walletAddress);

  // Generate unique quote ID
  const quoteId = uuidv4();

  // Extract route information from quoteResult
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

  // Cache the quote for execution
  // Store both quote and request data in the quote object for ETCSwap
  const cachedQuote = {
    quote: {
      ...quoteResult,
      methodParameters: quoteResult.methodParameters,
    },
    request: {
      network,
      walletAddress: walletAddress,
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
    priceImpactPct: quoteResult.priceImpact,
    minAmountOut,
    maxAmountIn,
    // ETCSwap-specific fields
    routePath,
  };
}

export { quoteSwap };

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  const chainConfig = getEthereumChainConfig();

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof ETCSwapQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get an executable swap quote from ETCSwap Universal Router',
        tags: ['/connector/etcSwap'],
        querystring: ETCSwapQuoteSwapRequest,
        response: { 200: ETCSwapQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network = chainConfig.defaultNetwork,
          walletAddress = chainConfig.defaultWallet,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct = ETCSwapConfig.config.slippagePct,
        } = request.query as typeof ETCSwapQuoteSwapRequest._type;

        return await quoteSwap(
          fastify,
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error getting quote:', e);
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

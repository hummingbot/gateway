import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Jupiter } from '../jupiter';
import { JupiterConfig } from '../jupiter.config';
import { JupiterQuoteSwapRequest, JupiterQuoteSwapResponse } from '../schemas';

// In-memory cache for quotes (with 30 second TTL)
const quoteCache = new Map<
  string,
  { quote: any; timestamp: number; request: any }
>();
const QUOTE_TTL = 30000; // 30 seconds

// Cleanup expired quotes periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, cached] of quoteCache.entries()) {
    if (now - cached.timestamp > QUOTE_TTL) {
      quoteCache.delete(id);
    }
  }
}, 10000); // Run every 10 seconds

export async function quoteSwap(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
  onlyDirectRoutes?: boolean,
  restrictIntermediateTokens?: boolean,
): Promise<Static<typeof JupiterQuoteSwapResponse>> {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      sanitizeErrorMessage(
        'Token not found: {}',
        !baseTokenInfo ? baseToken : quoteToken,
      ),
    );
  }

  // Determine input/output based on side
  const inputToken = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const outputToken = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;
  const inputAmount =
    side === 'SELL'
      ? amount * Math.pow(10, baseTokenInfo.decimals)
      : amount * Math.pow(10, quoteTokenInfo.decimals);

  logger.info(
    `Getting quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Get quote from Jupiter API
  const quoteResponse = await jupiter.getQuote(
    inputToken.address,
    outputToken.address,
    inputAmount / Math.pow(10, inputToken.decimals),
    slippagePct,
    onlyDirectRoutes ?? JupiterConfig.config.onlyDirectRoutes,
    restrictIntermediateTokens ??
      JupiterConfig.config.restrictIntermediateTokens,
    side === 'BUY' ? 'ExactOut' : 'ExactIn',
  );

  if (!quoteResponse) {
    throw fastify.httpErrors.notFound('No routes found for this swap');
  }

  const bestRoute = quoteResponse;
  const estimatedAmountIn =
    Number(quoteResponse.inAmount) / Math.pow(10, inputToken.decimals);
  const estimatedAmountOut =
    Number(quoteResponse.outAmount) / Math.pow(10, outputToken.decimals);

  // Calculate min/max amounts based on slippage
  const minAmountOut =
    side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : amount;
  const maxAmountIn =
    side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : amount;

  // Calculate price based on side
  const price =
    side === 'SELL'
      ? estimatedAmountOut / estimatedAmountIn
      : estimatedAmountIn / estimatedAmountOut;

  // Calculate price with slippage
  // For SELL: worst price = minAmountOut / estimatedAmountIn (minimum quote per base)
  // For BUY: worst price = maxAmountIn / estimatedAmountOut (maximum quote per base)
  const priceWithSlippage =
    side === 'SELL'
      ? minAmountOut / estimatedAmountIn
      : maxAmountIn / estimatedAmountOut;

  // Generate quote ID and cache the entire quote response
  const quoteId = uuidv4();
  const now = Date.now();

  quoteCache.set(quoteId, {
    quote: bestRoute,
    timestamp: now,
    request: {
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
      inputToken,
      outputToken,
    },
  });

  return {
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: side === 'SELL' ? estimatedAmountOut : amount,
    price,
    slippagePct,
    priceWithSlippage,
    minAmountOut,
    maxAmountIn,
    // Jupiter-specific fields
    quoteResponse: {
      inputMint: inputToken.address,
      inAmount: quoteResponse.inAmount,
      outputMint: outputToken.address,
      outAmount: quoteResponse.outAmount,
      otherAmountThreshold: quoteResponse.otherAmountThreshold || '0',
      swapMode: quoteResponse.swapMode || 'ExactIn',
      slippageBps: quoteResponse.slippageBps,
      platformFee: undefined, // Jupiter doesn't provide this in the quote
      priceImpactPct: quoteResponse.priceImpactPct || '0',
      routePlan: quoteResponse.routePlan || [],
      contextSlot: quoteResponse.contextSlot,
      timeTaken: quoteResponse.timeTaken,
    },
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof JupiterQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get an executable swap quote from Jupiter',
        tags: ['jupiter/swap'],
        querystring: JupiterQuoteSwapRequest,
        response: { 200: JupiterQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          onlyDirectRoutes,
          restrictIntermediateTokens,
        } = request.query as typeof JupiterQuoteSwapRequest._type;

        return await quoteSwap(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct ?? JupiterConfig.config.slippagePct,
          onlyDirectRoutes,
          restrictIntermediateTokens,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error getting quote:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

// Export quote cache for use in execute-quote
export { quoteCache };

export default quoteSwapRoute;

import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Jupiter } from '../jupiter';
import { JupiterConfig } from '../jupiter.config';
import { JupiterQuoteSwapRequest, JupiterQuoteSwapResponse } from '../schemas';

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
      sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
    );
  }

  // Determine input/output based on side
  const inputToken = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const outputToken = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;
  const inputAmount =
    side === 'SELL' ? amount * Math.pow(10, baseTokenInfo.decimals) : amount * Math.pow(10, quoteTokenInfo.decimals);

  logger.info(`Getting quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`);

  // Get quote from Jupiter API
  const quoteResponse = await jupiter.getQuote(
    inputToken.address,
    outputToken.address,
    inputAmount / Math.pow(10, inputToken.decimals),
    slippagePct,
    onlyDirectRoutes ?? JupiterConfig.config.onlyDirectRoutes,
    restrictIntermediateTokens ?? JupiterConfig.config.restrictIntermediateTokens,
    side === 'BUY' ? 'ExactOut' : 'ExactIn',
  );

  if (!quoteResponse) {
    throw fastify.httpErrors.notFound('No routes found for this swap');
  }

  const bestRoute = quoteResponse;
  const estimatedAmountIn = Number(quoteResponse.inAmount) / Math.pow(10, inputToken.decimals);
  const estimatedAmountOut = Number(quoteResponse.outAmount) / Math.pow(10, outputToken.decimals);

  // Calculate min/max amounts based on slippage
  const minAmountOut = side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : amount;
  const maxAmountIn = side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : amount;

  // Calculate price based on side
  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Generate quote ID and cache the entire quote response
  const quoteId = uuidv4();

  quoteCache.set(quoteId, bestRoute, {
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    inputToken,
    outputToken,
  });

  return {
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: side === 'SELL' ? estimatedAmountOut : amount,
    price,
    priceImpactPct: parseFloat(quoteResponse.priceImpactPct || '0'),
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

export default quoteSwapRoute;

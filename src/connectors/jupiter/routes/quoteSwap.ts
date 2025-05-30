import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';
import { Solana } from '../../../chains/solana/solana';
import {
  GetSwapQuoteRequestType,
  GetSwapQuoteResponseType,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Jupiter } from '../jupiter';

export async function getJupiterQuote(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
) {
  logger.info('=== Starting getJupiterQuote ===', {
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
  });

  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  logger.debug('Resolving tokens...');
  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  logger.debug('Token resolution results:', {
    baseToken: baseTokenInfo
      ? {
          symbol: baseTokenInfo.symbol,
          address: baseTokenInfo.address,
          decimals: baseTokenInfo.decimals,
        }
      : null,
    quoteToken: quoteTokenInfo
      ? {
          symbol: quoteTokenInfo.symbol,
          address: quoteTokenInfo.address,
          decimals: quoteTokenInfo.decimals,
        }
      : null,
  });

  if (!baseTokenInfo || !quoteTokenInfo) {
    const missingToken = !baseTokenInfo ? baseToken : quoteToken;
    logger.error(`Token not found: ${missingToken}`);
    throw fastify.httpErrors.notFound(`Token not found: ${missingToken}`);
  }

  const tradeSide = side === 'BUY' ? 'BUY' : 'SELL';
  // For BUY orders, amount represents the base token amount we want to receive
  // For SELL orders, amount represents the base token amount we want to send
  const amountValue = amount;

  try {
    let quote;

    if (tradeSide === 'BUY') {
      // BUY orders use ExactOut mode
      quote = await jupiter.getQuote(
        quoteTokenInfo.address,
        baseTokenInfo.address,
        amountValue,
        slippagePct,
        false,
        false,
        'ExactOut',
      );
    } else {
      // SELL order - standard ExactIn
      quote = await jupiter.getQuote(
        baseTokenInfo.address,
        quoteTokenInfo.address,
        amountValue,
        slippagePct,
        false,
        false,
        'ExactIn',
      );
    }

    // For BUY: we're buying baseToken with quoteToken, so output is base, input is quote
    // For SELL: we're selling baseToken for quoteToken, so input is base, output is quote
    const estimatedAmountIn =
      tradeSide === 'BUY'
        ? Number(quote.inAmount) / 10 ** quoteTokenInfo.decimals // Buying base with quote
        : Number(quote.inAmount) / 10 ** baseTokenInfo.decimals; // Selling base for quote

    const estimatedAmountOut =
      tradeSide === 'BUY'
        ? Number(quote.outAmount) / 10 ** baseTokenInfo.decimals // Getting base
        : Number(quote.outAmount) / 10 ** quoteTokenInfo.decimals; // Getting quote

    return {
      estimatedAmountIn:
        tradeSide === 'BUY' ? estimatedAmountOut : estimatedAmountIn, // Always in base token
      estimatedAmountOut:
        tradeSide === 'BUY' ? estimatedAmountIn : estimatedAmountOut, // Always in quote token
      minAmountOut:
        tradeSide === 'BUY' ? estimatedAmountIn : estimatedAmountOut,
      maxAmountIn: tradeSide === 'BUY' ? estimatedAmountOut : estimatedAmountIn,
      baseToken: baseTokenInfo,
      quoteToken: quoteTokenInfo,
      expectedPrice:
        tradeSide === 'BUY'
          ? estimatedAmountIn / estimatedAmountOut
          : estimatedAmountOut / estimatedAmountIn,
    };
  } catch (error: any) {
    logger.error(`Jupiter quote error: ${error.message || error}`);
    logger.error(`Jupiter quote error details:`, {
      baseToken,
      quoteToken,
      amount: amountValue,
      side: tradeSide,
      swapMode: tradeSide === 'BUY' ? 'ExactOut' : 'ExactIn',
      errorMessage: error.message,
      errorStack: error.stack,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
      fullError: JSON.stringify(error, null, 2),
    });

    if (error.message?.includes('NO_ROUTE_FOUND')) {
      throw fastify.httpErrors.notFound(
        `No swap route found for ${baseToken}-${quoteToken}`,
      );
    }

    if (error.message?.includes('ExactOut not supported')) {
      throw fastify.httpErrors.badRequest(error.message);
    }

    // Check for specific Jupiter API errors
    if (error.response?.data?.error) {
      throw fastify.httpErrors.badRequest(
        `Jupiter API error: ${error.response.data.error}`,
      );
    }

    throw fastify.httpErrors.internalServerError(
      `Failed to get Jupiter quote: ${error.message || 'Unknown error'}`,
    );
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get Jupiter swap quote',
        tags: ['jupiter'],
        querystring: {
          type: 'object',
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
          required: ['baseToken', 'quoteToken', 'amount', 'side'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              estimatedAmountIn: { type: 'number' },
              estimatedAmountOut: { type: 'number' },
              minAmountOut: { type: 'number' },
              maxAmountIn: { type: 'number' },
              baseTokenBalanceChange: { type: 'number' },
              quoteTokenBalanceChange: { type: 'number' },
              price: { type: 'number' },
              gasPrice: { type: 'number' },
              gasLimit: { type: 'number' },
              gasCost: { type: 'number' },
              poolAddress: {
                type: 'string',
                description: 'Jupiter aggregator ID',
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { network, baseToken, quoteToken, amount, side, slippagePct } =
        request.query;
      const networkToUse = network || 'mainnet-beta';

      // Verify we have the needed parameters
      if (!baseToken || !quoteToken) {
        throw fastify.httpErrors.badRequest(
          'baseToken and quoteToken are required',
        );
      }

      // Log the operation
      logger.debug(
        `Getting Jupiter quote for ${baseToken}-${quoteToken} with default routing`,
      );

      // Get the quote
      const quote = await getJupiterQuote(
        fastify,
        networkToUse,
        baseToken,
        quoteToken,
        amount,
        side as 'BUY' | 'SELL',
        slippagePct,
      );

      // Get gas estimation
      let gasEstimation = null;
      try {
        gasEstimation = await estimateGasSolana(fastify, networkToUse);
      } catch (error) {
        logger.warn(`Failed to estimate gas for swap quote: ${error.message}`);
      }

      return {
        estimatedAmountIn: quote.estimatedAmountIn,
        estimatedAmountOut: quote.estimatedAmountOut,
        minAmountOut: quote.minAmountOut,
        maxAmountIn: quote.maxAmountIn,
        baseTokenBalanceChange:
          side === 'SELL' ? -quote.estimatedAmountIn : quote.estimatedAmountIn,
        quoteTokenBalanceChange:
          side === 'SELL'
            ? quote.estimatedAmountOut
            : -quote.estimatedAmountOut,
        price: quote.expectedPrice,
        gasPrice: gasEstimation?.gasPrice,
        gasLimit: gasEstimation?.gasLimit,
        gasCost: gasEstimation?.gasCost,
        poolAddress: 'jupiter-aggregator', // Jupiter doesn't expose specific pool addresses
      };
    },
  );
};

export default quoteSwapRoute;

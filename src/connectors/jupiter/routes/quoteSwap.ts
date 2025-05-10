import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../../../chains/solana/solana';
import { Jupiter } from '../jupiter';
import { logger } from '../../../services/logger';
import { GetSwapQuoteRequestType, GetSwapQuoteResponseType } from '../../../schemas/trading-types/swap-schema';
import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';

export async function getJupiterQuote(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number
) {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.notFound(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
  }

  const tradeSide = side === 'BUY' ? 'BUY' : 'SELL';
  const amountValue = side === 'BUY' ? amount : amount;

  try {
    const quote = await jupiter.getQuote(
      tradeSide === 'BUY' ? quoteTokenInfo.address : baseTokenInfo.address,
      tradeSide === 'BUY' ? baseTokenInfo.address : quoteTokenInfo.address,
      amountValue,
      slippagePct,
      false, // onlyDirectRoutes
      false, // asLegacyTransaction
      tradeSide === 'BUY' ? 'ExactOut' : 'ExactIn'
    );

    const baseAmount = tradeSide === 'BUY'
      ? Number(quote.outAmount) / (10 ** baseTokenInfo.decimals)
      : Number(quote.inAmount) / (10 ** baseTokenInfo.decimals);
    const quoteAmount = tradeSide === 'BUY'
      ? Number(quote.inAmount) / (10 ** quoteTokenInfo.decimals)
      : Number(quote.outAmount) / (10 ** quoteTokenInfo.decimals);
    
    return {
      estimatedAmountIn: baseAmount,
      estimatedAmountOut: quoteAmount,
      minAmountOut: quoteAmount,
      maxAmountIn: baseAmount,
      baseToken: baseTokenInfo,
      quoteToken: quoteTokenInfo,
      expectedPrice: quoteAmount / baseAmount,
    };
  } catch (error) {
    logger.error(`Jupiter quote error: ${error}`);
    if (error.message.includes('NO_ROUTE_FOUND')) {
      throw fastify.httpErrors.notFound(`No swap route found for ${baseToken}-${quoteToken}`);
    }
    throw fastify.httpErrors.internalServerError('Failed to get Jupiter quote');
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
          required: ['baseToken', 'quoteToken', 'amount', 'side']
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
              poolAddress: { type: 'string', description: 'Jupiter aggregator ID' }
            }
          }
        }
      }
    },
    async (request) => {
      const { network, baseToken, quoteToken, amount, side, slippagePct } = request.query;
      const networkToUse = network || 'mainnet-beta';

      // Verify we have the needed parameters
      if (!baseToken || !quoteToken) {
        throw fastify.httpErrors.badRequest('baseToken and quoteToken are required');
      }

      // Log the operation
      logger.debug(`Getting Jupiter quote for ${baseToken}-${quoteToken} with default routing`);
      
      // Get the quote
      const quote = await getJupiterQuote(
        fastify,
        networkToUse,
        baseToken,
        quoteToken,
        amount,
        side as 'BUY' | 'SELL',
        slippagePct
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
        baseTokenBalanceChange: side === 'SELL' ? -quote.estimatedAmountIn : quote.estimatedAmountIn,
        quoteTokenBalanceChange: side === 'SELL' ? quote.estimatedAmountOut : -quote.estimatedAmountOut,
        price: quote.expectedPrice,
        gasPrice: gasEstimation?.gasPrice,
        gasLimit: gasEstimation?.gasLimit,
        gasCost: gasEstimation?.gasCost,
        poolAddress: 'jupiter-aggregator' // Jupiter doesn't expose specific pool addresses
      };
    }
  );
};

export default quoteSwapRoute; 
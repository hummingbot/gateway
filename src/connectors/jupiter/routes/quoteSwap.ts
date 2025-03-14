import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../../../chains/solana/solana';
import { Jupiter } from '../jupiter';
import { logger } from '../../../services/logger';
import { GetSwapQuoteRequestType, GetSwapQuoteResponseType } from '../../../schemas/routes/swap-schema';

export async function getJupiterQuote(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'buy' | 'sell',
  slippagePct?: number
) {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.notFound(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
  }

  const tradeSide = side === 'buy' ? 'BUY' : 'SELL';
  const amountValue = side === 'buy' ? amount : amount;

  try {
    const quote = await jupiter.getQuote(
      baseTokenInfo.address,
      quoteTokenInfo.address,
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
          required: ['baseToken', 'quoteToken', 'amount', 'side'],
          properties: {
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['buy', 'sell'], examples: ['sell'] },
            slippagePct: { type: 'number', examples: [1] }
          }
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
              price: { type: 'number' }
            }
          }
        }
      }
    },
    async (request) => {
      const { network, baseToken, quoteToken, amount, side, slippagePct } = request.query;
      const quote = await getJupiterQuote(
        fastify,
        network || 'mainnet-beta',
        baseToken,
        quoteToken,
        amount,
        side as 'buy' | 'sell',
        slippagePct
      );

      return {
        estimatedAmountIn: quote.estimatedAmountIn,
        estimatedAmountOut: quote.estimatedAmountOut,
        minAmountOut: quote.minAmountOut,
        maxAmountIn: quote.maxAmountIn,
        baseTokenBalanceChange: side === 'sell' ? -quote.estimatedAmountIn : quote.estimatedAmountOut,
        quoteTokenBalanceChange: side === 'sell' ? quote.estimatedAmountOut : -quote.estimatedAmountIn,
        price: quote.expectedPrice
      };
    }
  );
};

export default quoteSwapRoute; 
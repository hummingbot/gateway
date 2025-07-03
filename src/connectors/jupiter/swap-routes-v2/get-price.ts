import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  GetPriceRequestType,
  GetPriceResponseType,
  GetPriceResponse,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Jupiter } from '../jupiter';
import { JupiterGetPriceRequest } from '../schemas';

async function getPrice(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  onlyDirectRoutes?: boolean,
  asLegacyTransaction?: boolean,
): Promise<GetPriceResponseType> {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      `Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`,
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
    `Getting price for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Get quote from Jupiter API
  const quoteResponse = await jupiter.getQuote(
    inputToken.address,
    outputToken.address,
    inputAmount / Math.pow(10, inputToken.decimals),
    0.5, // Use minimal slippage for price discovery
    onlyDirectRoutes || false,
    asLegacyTransaction || false,
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

  // Calculate price based on side
  const price =
    side === 'SELL'
      ? estimatedAmountOut / estimatedAmountIn
      : estimatedAmountIn / estimatedAmountOut;

  // Calculate price impact
  const priceImpactPct = quoteResponse.priceImpactPct
    ? Number(quoteResponse.priceImpactPct)
    : 0;

  return {
    estimatedAmountIn: side === 'SELL' ? amount : estimatedAmountIn,
    estimatedAmountOut: side === 'SELL' ? estimatedAmountOut : amount,
    price,
    priceImpactPct,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    tokenInAmount: estimatedAmountIn,
    tokenOutAmount: estimatedAmountOut,
  };
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
          'Get an indicative price quote for a token swap on Jupiter',
        tags: ['jupiter/swap'],
        querystring: {
          ...JupiterGetPriceRequest,
          properties: {
            ...JupiterGetPriceRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
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
        const {
          network,
          baseToken,
          quoteToken,
          amount,
          side,
          onlyDirectRoutes,
          asLegacyTransaction,
        } = request.query as typeof JupiterGetPriceRequest._type;

        return await getPrice(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          onlyDirectRoutes,
          asLegacyTransaction,
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error('Error getting price:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default getPriceRoute;

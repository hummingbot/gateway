import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getOrcaSwapQuote } from '../orca.utils';
import { OrcaClmmQuoteSwapRequest, OrcaClmmQuoteSwapRequestType } from '../schemas';

export async function getRawSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = 1,
) {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);

  // Get token info
  const baseTokenInfo = await solana.getToken(baseTokenSymbol);
  const quoteTokenInfo = await solana.getToken(quoteTokenSymbol);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  // Determine input/output tokens based on side
  const [inputToken, outputToken] = side === 'BUY' ? [quoteTokenInfo, baseTokenInfo] : [baseTokenInfo, quoteTokenInfo];

  // Get swap quote using helper
  const quote = await getOrcaSwapQuote(
    orca.solanaKitRpc,
    poolAddress,
    inputToken.address,
    outputToken.address,
    amount,
    slippagePct,
  );

  return quote;
}

async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = 1,
): Promise<QuoteSwapResponseType> {
  const quote = await getRawSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress,
    slippagePct,
  );

  return {
    poolAddress,
    tokenIn: quote.inputToken,
    tokenOut: quote.outputToken,
    amountIn: quote.inputAmount,
    amountOut: quote.outputAmount,
    price: quote.price,
    slippagePct,
    minAmountOut: quote.minOutputAmount,
    maxAmountIn: quote.maxInputAmount,
    priceImpactPct: quote.priceImpactPct,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: OrcaClmmQuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Orca CLMM',
        tags: ['/connector/orca'],
        querystring: OrcaClmmQuoteSwapRequest,
        response: {
          200: QuoteSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query;
        const networkUsed = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

        const solana = await Solana.getInstance(networkUsed);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'orca',
            networkUsed,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Orca`,
            );
          }

          poolAddressToUse = pool.address;
        }

        return await formatSwapQuote(
          fastify,
          networkUsed,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressToUse,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

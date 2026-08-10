import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getOrcaSwapQuote } from '../orca.utils';
import { OrcaClmmQuoteSwapRequest, OrcaClmmQuoteSwapRequestType } from '../schemas';

export async function getRawSwapQuote(
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
    throw httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  // Get swap quote using helper (BUY = exact output of base, SELL = exact input of base)
  const quote = await getOrcaSwapQuote(
    orca.solanaKitRpc,
    poolAddress,
    baseTokenInfo.address,
    quoteTokenInfo.address,
    amount,
    side,
    slippagePct,
    network,
  );

  return quote;
}

async function formatSwapQuote(
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = 1,
): Promise<QuoteSwapResponseType> {
  const quote = await getRawSwapQuote(
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
          throw httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

        const solana = await Solana.getInstance(networkUsed);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
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
            throw httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Orca`,
            );
          }

          poolAddressToUse = pool.address;
        }

        return await formatSwapQuote(
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
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

/**
 * Resolves the counter ("quote") token for an Orca whirlpool given the base token. The standardized
 * swap wrappers take poolAddress + baseToken and derive the other side from the pool
 * (tokenMintA/tokenMintB), so callers no longer pass quoteToken.
 */
export async function resolveCounterToken(network: string, poolAddress: string, baseToken: string): Promise<string> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const whirlpool = await orca.getWhirlpool(poolAddress);
  if (!whirlpool) throw httpErrors.notFound(`Pool not found: ${poolAddress}`);
  const mintA = whirlpool.tokenMintA.toString();
  const mintB = whirlpool.tokenMintB.toString();
  const resolved = await solana.getToken(baseToken);
  const baseAddr = resolved ? resolved.address : baseToken;
  if (baseAddr === mintA) return mintB;
  if (baseAddr === mintB) return mintA;
  throw httpErrors.badRequest(`Token ${baseToken} is not part of pool ${poolAddress}`);
}

/**
 * Standard CLMM quote-swap entry point (network-based) — consumed by the unified swap router.
 * Requires poolAddress; the quote token is derived from the pool.
 */
export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct?: number,
): Promise<QuoteSwapResponseType> {
  const quoteToken = await resolveCounterToken(network, poolAddress, baseToken);
  return await formatSwapQuote(network, baseToken, quoteToken, amount, side, poolAddress, slippagePct);
}

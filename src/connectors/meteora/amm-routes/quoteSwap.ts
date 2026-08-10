import { PoolState, SwapMode } from '@meteora-ag/cp-amm-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponse, QuoteSwapResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraAmmQuoteSwapRequest } from '../schemas';

/**
 * A fully-resolved DAMM v2 swap quote. The BN fields are what the swap instruction consumes;
 * the number fields are the human-readable amounts for the API response.
 */
export interface RawSwapQuote {
  poolState: PoolState;
  side: 'BUY' | 'SELL';
  swapMode: SwapMode;
  inputMint: PublicKey;
  outputMint: PublicKey;
  // Instruction inputs
  amountInBN: BN; // exact-in amount (SELL)
  amountOutBN: BN; // exact-out amount (BUY)
  minimumAmountOutBN: BN; // SELL slippage guard
  maximumAmountInBN: BN; // BUY slippage guard
  // Human-readable
  amountIn: number;
  amountOut: number;
  minAmountOut: number;
  maxAmountIn: number;
  price: number; // quote token per base token, in the request's base/quote terms
  priceImpactPct: number;
}

function toUi(raw: BN, decimals: number): number {
  return new Decimal(raw.toString()).div(new Decimal(10).pow(decimals)).toNumber();
}

function toRaw(amount: number, decimals: number): BN {
  return new BN(new Decimal(amount).mul(new Decimal(10).pow(decimals)).toFixed(0));
}

/** Resolves a token symbol or mint address to a PublicKey using the token list, then raw address. */
async function resolveMint(solana: Solana, tokenOrAddress: string): Promise<PublicKey> {
  const tokenInfo = await solana.getToken(tokenOrAddress);
  if (tokenInfo) return new PublicKey(tokenInfo.address);
  try {
    return new PublicKey(tokenOrAddress);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', tokenOrAddress));
  }
}

/**
 * Builds a swap quote for a DAMM v2 pool. `amount` is always denominated in the base token.
 * SELL sells the base token (exact-in); BUY buys the base token (exact-out).
 */
export async function getRawSwapQuote(
  meteoraDamm: MeteoraDamm,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number,
): Promise<RawSwapQuote> {
  const solana = meteoraDamm.solana;
  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const { tokenADecimal, tokenBDecimal } = await meteoraDamm.getTokenDecimals(poolState);

  const baseMint = await resolveMint(solana, baseToken);
  const baseIsTokenA = baseMint.equals(poolState.tokenAMint);
  if (!baseIsTokenA && !baseMint.equals(poolState.tokenBMint)) {
    throw httpErrors.badRequest(`Token ${baseMint.toBase58()} is not part of pool ${poolAddress}`);
  }
  const baseDecimal = baseIsTokenA ? tokenADecimal : tokenBDecimal;
  const otherDecimal = baseIsTokenA ? tokenBDecimal : tokenADecimal;
  const otherMint = baseIsTokenA ? poolState.tokenBMint : poolState.tokenAMint;

  const slot = await solana.connection.getSlot();
  const time = await solana.connection.getBlockTime(slot);
  const currentPoint = meteoraDamm.getCurrentPoint(poolState, slot, time ?? Math.floor(Date.now() / 1000));

  let result: RawSwapQuote;
  if (side === 'SELL') {
    const amountInBN = toRaw(amount, baseDecimal);
    const quote = meteoraDamm.cpAmm.getQuote2({
      inputTokenMint: baseMint,
      poolState,
      currentPoint,
      amountIn: amountInBN,
      slippage: slippagePct,
      swapMode: SwapMode.ExactIn,
      tokenADecimal,
      tokenBDecimal,
      hasReferral: false,
    });
    const amountOut = toUi(quote.outputAmount, otherDecimal);
    const minAmountOut = toUi(quote.minimumAmountOut, otherDecimal);
    result = {
      poolState,
      side,
      swapMode: SwapMode.ExactIn,
      inputMint: baseMint,
      outputMint: otherMint,
      amountInBN,
      amountOutBN: new BN(0),
      minimumAmountOutBN: quote.minimumAmountOut,
      maximumAmountInBN: amountInBN,
      amountIn: amount,
      amountOut,
      minAmountOut,
      maxAmountIn: amount,
      price: amount > 0 ? amountOut / amount : 0,
      priceImpactPct: Number(quote.priceImpact.toString()),
    };
  } else {
    const amountOutBN = toRaw(amount, baseDecimal);
    const quote = meteoraDamm.cpAmm.getQuote2({
      inputTokenMint: otherMint,
      poolState,
      currentPoint,
      amountOut: amountOutBN,
      slippage: slippagePct,
      swapMode: SwapMode.ExactOut,
      tokenADecimal,
      tokenBDecimal,
      hasReferral: false,
    });
    const amountIn = toUi(quote.includedFeeInputAmount, otherDecimal);
    const maxAmountIn = toUi(quote.maximumAmountIn, otherDecimal);
    result = {
      poolState,
      side,
      swapMode: SwapMode.ExactOut,
      inputMint: otherMint,
      outputMint: baseMint,
      amountInBN: new BN(0),
      amountOutBN,
      minimumAmountOutBN: amountOutBN,
      maximumAmountInBN: quote.maximumAmountIn,
      amountIn,
      amountOut: amount,
      minAmountOut: amount,
      maxAmountIn,
      price: amount > 0 ? amountIn / amount : 0,
      priceImpactPct: Number(quote.priceImpact.toString()),
    };
  }
  return result;
}

/**
 * Standard AMM quote-swap entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. Wraps getRawSwapQuote and shapes it into the shared QuoteSwapResponse.
 */
export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct?: number,
): Promise<QuoteSwapResponseType> {
  const meteoraDamm = await MeteoraDamm.getInstance(network);
  const effectiveSlippage = slippagePct ?? MeteoraConfig.config.slippagePct;
  const quote = await getRawSwapQuote(meteoraDamm, poolAddress, baseToken, side, amount, effectiveSlippage);
  return {
    poolAddress,
    tokenIn: quote.inputMint.toBase58(),
    tokenOut: quote.outputMint.toBase58(),
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    price: quote.price,
    slippagePct: effectiveSlippage,
    minAmountOut: quote.minAmountOut,
    maxAmountIn: quote.maxAmountIn,
    priceImpactPct: quote.priceImpactPct,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: typeof MeteoraAmmQuoteSwapRequest.static;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote for a Meteora DAMM v2 pool',
        tags: ['/connector/meteora'],
        querystring: MeteoraAmmQuoteSwapRequest,
        response: {
          200: QuoteSwapResponse,
        },
      },
    },
    async (request): Promise<QuoteSwapResponseType> => {
      try {
        const { network, poolAddress, baseToken, amount, side, slippagePct } = request.query;
        return await quoteSwap(network, poolAddress, baseToken, side as 'BUY' | 'SELL', amount, slippagePct);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to get swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

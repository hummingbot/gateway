import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Decimal } from 'decimal.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';
import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';

// Schema definitions
const GetSwapQuoteRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  baseToken: Type.String({ default: 'M3M3' }),
  quoteToken: Type.String({ default: 'USDC' }),
  amount: Type.Number({ default: 10 }),
  side: Type.String({ 
    enum: ['buy', 'sell'],
    default: 'buy',
    description: 'Trade direction'
  }),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
  slippagePct: Type.Optional(Type.Number({ default: 1 })),
});

const GetSwapQuoteResponse = Type.Object({
  estimatedAmountIn: Type.String(),
  estimatedAmountOut: Type.String(),
  minOutAmount: Type.String(),
});

type GetSwapQuoteRequestType = Static<typeof GetSwapQuoteRequest>;
type GetSwapQuoteResponseType = Static<typeof GetSwapQuoteResponse>;

export async function getMeteoraSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'buy' | 'sell',
  poolAddress: string,
  slippagePct?: number
) {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw fastify.httpErrors.notFound(
      `Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`
    );
  }

  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // For buy orders, we're swapping quote token for base token (ExactOut)
  // For sell orders, we're swapping base token for quote token (ExactIn)
  const [inputToken, outputToken] = side === 'buy' 
    ? [quoteToken, baseToken]
    : [baseToken, quoteToken];

  const amount_bn = DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);
  const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();
  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const effectiveSlippage = new BN((slippagePct ?? meteora.getSlippagePct()) * 100);

  const quote = side === 'buy'
    ? dlmmPool.swapQuoteExactOut(
        amount_bn,
        swapForY,
        effectiveSlippage,
        binArrays
      )
    : dlmmPool.swapQuote(
        amount_bn,
        swapForY,
        effectiveSlippage,
        binArrays
      );

  return {
    inputToken,
    outputToken,
    swapAmount: amount_bn,
    swapForY,
    quote,
    dlmmPool,
  };
}

async function getSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'buy' | 'sell',
  poolAddress: string,
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  const { inputToken, outputToken, quote } = await getMeteoraSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side as 'buy' | 'sell',
    poolAddress,
    slippagePct
  );

  if (side === 'buy') {
    const exactOutQuote = quote as SwapQuoteExactOut;
    return {
      estimatedAmountIn: DecimalUtil.fromBN(exactOutQuote.maxInAmount, inputToken.decimals).toString(),
      estimatedAmountOut: DecimalUtil.fromBN(exactOutQuote.outAmount, outputToken.decimals).toString(),
      minOutAmount: DecimalUtil.fromBN(exactOutQuote.outAmount, outputToken.decimals).toString(),
    };
  } else {
    const exactInQuote = quote as SwapQuote;
    return {
      estimatedAmountIn: DecimalUtil.fromBN(exactInQuote.consumedInAmount, inputToken.decimals).toString(),
      estimatedAmountOut: DecimalUtil.fromBN(exactInQuote.outAmount, outputToken.decimals).toString(),
      minOutAmount: DecimalUtil.fromBN(exactInQuote.minOutAmount, outputToken.decimals).toString(),
    };
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
        description: 'Get a swap quote for Meteora',
        tags: ['meteora'],
        querystring: GetSwapQuoteRequest,
        response: {
          200: GetSwapQuoteResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query;
        const networkToUse = network || 'mainnet-beta';

        return await getSwapQuote(
          fastify,
          networkToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'buy' | 'sell',
          poolAddress,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) return e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteSwapRoute; 
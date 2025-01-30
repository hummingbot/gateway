import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Decimal } from 'decimal.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';
import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { 
  GetSwapQuoteRequestType,
  GetSwapQuoteResponseType,
  GetSwapQuoteRequest,
  GetSwapQuoteResponse
} from '../../../services/swap-interfaces';

export async function getRawSwapQuote(
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

  const amount_bn = side === 'buy'
    ? DecimalUtil.toBN(new Decimal(amount), outputToken.decimals)
    : DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);
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

async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'buy' | 'sell',
  poolAddress: string,
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  const { inputToken, outputToken, quote } = await getRawSwapQuote(
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
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['M3M3'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [10] },
            side: { type: 'string', examples: ['buy'] },
            poolAddress: { type: 'string', examples: ['FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: GetSwapQuoteResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query;
        const networkToUse = network || 'mainnet-beta';

        return await formatSwapQuote(
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
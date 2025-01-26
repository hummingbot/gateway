import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Decimal } from 'decimal.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';

// Schema definitions
const GetSwapQuoteRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  inputToken: Type.String({ default: 'M3M3' }),
  outputToken: Type.String({ default: 'USDC' }),
  amount: Type.Number({ default: 10 }),
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

async function getSwapQuote(
  fastify: FastifyInstance,
  network: string,
  inputTokenSymbol: string,
  outputTokenSymbol: string,
  amount: number,
  poolAddress: string,
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
    const solana = await Solana.getInstance(network);
    const meteora = await Meteora.getInstance(network);
    const inputToken = await solana.getToken(inputTokenSymbol);
    const outputToken = await solana.getToken(outputTokenSymbol);

    if (!inputToken || !outputToken) {
      throw fastify.httpErrors.notFound(
        `Token not found: ${!inputToken ? inputTokenSymbol : outputTokenSymbol}`
      );
    }

    const dlmmPool = await meteora.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
    }

    await dlmmPool.refetchStates();

    const swapAmount = DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);
    const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();
    const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
    const effectiveSlippage = new BN((slippagePct ?? meteora.getSlippagePct()) * 100);

    const quote = dlmmPool.swapQuote(swapAmount, swapForY, effectiveSlippage, binArrays);

    return {
      estimatedAmountIn: DecimalUtil.fromBN(quote.consumedInAmount, inputToken.decimals).toString(),
      estimatedAmountOut: DecimalUtil.fromBN(quote.outAmount, outputToken.decimals).toString(),
      minOutAmount: DecimalUtil.fromBN(quote.minOutAmount, outputToken.decimals).toString(),
    };
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
        const { network, inputToken, outputToken, amount, poolAddress, slippagePct } = request.query;
        const networkToUse = network || 'mainnet-beta';

        return await getSwapQuote(
          fastify,
          networkToUse,
          inputToken,
          outputToken,
          amount,
          poolAddress,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) return e; // Return Fastify formatted errors
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteSwapRoute; 
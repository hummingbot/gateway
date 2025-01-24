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
  network: Type.String(),
  inputTokenSymbol: Type.String(),
  outputTokenSymbol: Type.String(),
  amount: Type.Number(),
  poolAddress: Type.String(),
  slippagePct: Type.Optional(Type.Number()),
});

const GetSwapQuoteResponse = Type.Object({
  inputAmount: Type.Number(),
  outputAmount: Type.Number(),
  fee: Type.Number(),
  priceImpact: Type.Number(),
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
    const inputToken = await solana.getTokenBySymbol(inputTokenSymbol);
  const outputToken = await solana.getTokenBySymbol(outputTokenSymbol);

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
    inputAmount: Number(DecimalUtil.fromBN(quote.consumedInAmount, inputToken.decimals)),
    outputAmount: Number(DecimalUtil.fromBN(quote.outAmount, outputToken.decimals)),
    fee: Number(DecimalUtil.fromBN(quote.fee, outputToken.decimals)),
    priceImpact: Number(quote.priceImpact.toFixed(4))
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
        swaggerQueryExample: {
          network: 'mainnet-beta',
          inputTokenSymbol: 'SOL',
          outputTokenSymbol: 'USDC',
          amount: 1,
          poolAddress: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'
        }
      }
    },
    async (request) => {
      try {
        const { network, inputTokenSymbol, outputTokenSymbol, amount, poolAddress, slippagePct } = request.query;

        return await getSwapQuote(
          fastify,
          network,
          inputTokenSymbol,
          outputTokenSymbol,
          amount,
          poolAddress,
          slippagePct
        );
      } catch (e) {
        if (e.statusCode) return e; // Return Fastify formatted errors
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteSwapRoute; 
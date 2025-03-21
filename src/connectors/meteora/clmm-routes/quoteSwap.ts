import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Decimal } from 'decimal.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';
import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { 
  GetCLMMSwapQuoteRequestType,
  GetCLMMSwapQuoteRequest,
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse
} from '../../../schemas/trading-types/swap-schema';
import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';

export async function getRawSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
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
  const [inputToken, outputToken] = side === 'BUY' 
    ? [quoteToken, baseToken]
    : [baseToken, quoteToken];

  const amount_bn = side === 'BUY'
    ? DecimalUtil.toBN(new Decimal(amount), outputToken.decimals)
    : DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);
  const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();
  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const effectiveSlippage = new BN((slippagePct ?? meteora.getSlippagePct()) * 100);

  const quote = side === 'BUY'
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
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  const { inputToken, outputToken, quote, dlmmPool } = await getRawSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side as 'BUY' | 'SELL',
    poolAddress,
    slippagePct
  );

  // Get tokens in pool order (X, Y) for consistent balance change calculation
  const solana = await Solana.getInstance(network);
  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());

  if (!tokenX || !tokenY) {
    throw new Error('Failed to get pool tokens');
  }

  if (side === 'BUY') {
    const exactOutQuote = quote as SwapQuoteExactOut;
    const estimatedAmountIn = DecimalUtil.fromBN(exactOutQuote.inAmount, inputToken.decimals).toNumber();
    const maxAmountIn = DecimalUtil.fromBN(exactOutQuote.maxInAmount, inputToken.decimals).toNumber();
    const amountOut = DecimalUtil.fromBN(exactOutQuote.outAmount, outputToken.decimals).toNumber();

    const price = amountOut / estimatedAmountIn;

    return {
      estimatedAmountIn,
      estimatedAmountOut: amountOut,
      maxAmountIn,
      minAmountOut: amountOut,
      baseTokenBalanceChange: amountOut,
      quoteTokenBalanceChange: -estimatedAmountIn,
      price,
      gasPrice: 0,
      gasLimit: 0,
      gasCost: 0
    };
  } else {
    const exactInQuote = quote as SwapQuote;
    const estimatedAmountIn = DecimalUtil.fromBN(exactInQuote.consumedInAmount, inputToken.decimals).toNumber();
    const estimatedAmountOut = DecimalUtil.fromBN(exactInQuote.outAmount, outputToken.decimals).toNumber();
    const minAmountOut = DecimalUtil.fromBN(exactInQuote.minOutAmount, outputToken.decimals).toNumber();

    // For sell orders:
    // - Base token (input) decreases (negative)
    // - Quote token (output) increases (positive)
    const baseTokenChange = -estimatedAmountIn;
    const quoteTokenChange = estimatedAmountOut;

    const price = estimatedAmountOut / estimatedAmountIn;

    return {
      estimatedAmountIn,
      estimatedAmountOut,
      minAmountOut,
      maxAmountIn: estimatedAmountIn,
      baseTokenBalanceChange: baseTokenChange,
      quoteTokenBalanceChange: quoteTokenChange,
      price,
      gasPrice: 0,
      gasLimit: 0,
      gasCost: 0
    };
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetCLMMSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote for Meteora',
        tags: ['meteora'],
        querystring: {
          ...GetCLMMSwapQuoteRequest,
          properties: {
            ...GetCLMMSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: ['2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3'] },
            slippagePct: { type: 'number', examples: [1] },
          }
        },
        response: {
          200: {
            properties: {
              ...GetSwapQuoteResponse.properties,
            }
          }
        },
      }
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query;
        const networkToUse = network || 'mainnet-beta';

        const result = await formatSwapQuote(
          fastify,
          networkToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
          slippagePct
        );

        let gasEstimation = null;
        try {
          gasEstimation = await estimateGasSolana(fastify, networkToUse);
        } catch (error) {
          logger.warn(`Failed to estimate gas for swap quote: ${error.message}`);
        }

        return {
          ...result,
          gasPrice: gasEstimation?.gasPrice,
          gasLimit: gasEstimation?.gasLimit,
          gasCost: gasEstimation?.gasCost
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteSwapRoute; 
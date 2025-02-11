import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { RaydiumCLMM } from '../raydium-clmm';
import { Solana } from '../../../chains/solana/solana';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Decimal } from 'decimal.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';
import { 
  GetSwapQuoteRequestType,
  GetSwapQuoteResponseType,
  GetSwapQuoteRequest,
  GetSwapQuoteResponse
} from '../../../services/swap-interfaces';
import { PoolUtils } from '@raydium-io/raydium-sdk-v2';

export async function getSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'buy' | 'sell',
  poolAddress: string,
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await RaydiumCLMM.getInstance(network);
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);
  
  if (!baseToken || !quoteToken) {
    throw fastify.httpErrors.notFound(
      `Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`
    );
  }

  // For buy orders, we're swapping quote token for base token (ExactOut)
  // For sell orders, we're swapping base token for quote token (ExactIn)
  const [inputToken, outputToken] = side === 'buy' 
    ? [quoteToken, baseToken]
    : [baseToken, quoteToken];

  const amount_bn = side === 'buy'
    ? DecimalUtil.toBN(new Decimal(amount), outputToken.decimals)
    : DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);

  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  const baseIn = poolInfo.mintA.address === baseToken.address ? true : false

  const clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
    connection: solana.connection,
    poolInfo,
  })
  const tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
    connection: solana.connection,
    poolKeys: [clmmPoolInfo],
  })
  const effectiveSlippage = new BN((slippagePct ?? raydium.getSlippagePct()) / 100);

  
  const { minAmountOut } = await PoolUtils.computeAmountOutFormat({
    poolInfo: clmmPoolInfo,
    tickArrayCache: tickCache[poolAddress],
    amountIn: amount_bn,
    tokenOut: poolInfo[baseIn ? 'mintB' : 'mintA'],
    slippage: effectiveSlippage,
    epochInfo: await raydium.raydium.fetchEpochInfo(),
  })

  const amountOut = minAmountOut.amount.raw.toNumber() / 10 ** outputToken.decimals;

  return {
    estimatedAmountIn: amount,
    estimatedAmountOut: amountOut,
    minAmountOut: amountOut,
    maxAmountIn: amount,
    baseTokenBalanceChange: side === 'buy' ? amountOut : -amount,
    quoteTokenBalanceChange: side === 'buy' ? -amount : amountOut,
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
        description: 'Get swap quote for Raydium CLMM',
        tags: ['raydium-clmm'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['RAY'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', examples: ['buy'] },
            poolAddress: { type: 'string', examples: ['61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht'] },
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
        throw fastify.httpErrors.internalServerError('Failed to get swap quote');
      }
    }
  );
};

export default quoteSwapRoute;

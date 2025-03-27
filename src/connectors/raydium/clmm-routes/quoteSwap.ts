import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Raydium } from '../raydium';
import { Solana } from '../../../chains/solana/solana';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Decimal } from 'decimal.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';
import { 
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetCLMMSwapQuoteRequestType,
  GetCLMMSwapQuoteRequest
} from '../../../schemas/trading-types/swap-schema';
import {
  PoolUtils,
  ReturnTypeComputeAmountOutFormat,
  ReturnTypeComputeAmountOutBaseOut
} from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';


export async function getSwapQuote(
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
  const raydium = await Raydium.getInstance(network);
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);
  
  if (!baseToken || !quoteToken) {
    throw fastify.httpErrors.notFound(
      `Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`
    );
  }

  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) {
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
  const clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
    connection: solana.connection,
    poolInfo,
  })
  const tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
    connection: solana.connection,
    poolKeys: [clmmPoolInfo],
  })
  const effectiveSlippage = new BN((slippagePct ?? raydium.getSlippagePct('clmm')) / 100);

  // Convert BN to number for slippage
  const effectiveSlippageNumber = effectiveSlippage.toNumber();

  // AmountOut = swapQuote, AmountOutBaseOut = swapQuoteExactOut
  const response : ReturnTypeComputeAmountOutFormat | ReturnTypeComputeAmountOutBaseOut = side === 'BUY' 
  ? await PoolUtils.computeAmountIn({
    poolInfo: clmmPoolInfo,
    tickArrayCache: tickCache[poolAddress],
    amountOut: amount_bn,
    epochInfo: await raydium.raydiumSDK.fetchEpochInfo(),
    baseMint: new PublicKey(poolInfo['mintB'].address),
    slippage: effectiveSlippageNumber,
  })
  : await PoolUtils.computeAmountOutFormat({
      poolInfo: clmmPoolInfo,
      tickArrayCache: tickCache[poolAddress],
      amountIn: amount_bn,
      tokenOut: poolInfo['mintB'],
      slippage: effectiveSlippageNumber,
      epochInfo: await raydium.raydiumSDK.fetchEpochInfo(),
      catchLiquidityInsufficient: true,
    })

  const price = side === 'SELL'
    ? (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.raw.toNumber() / 
      (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.raw.toNumber()
    : (response as ReturnTypeComputeAmountOutBaseOut).amountIn.amount.toNumber() / 
      (response as ReturnTypeComputeAmountOutBaseOut).realAmountOut.amount.toNumber();

  return {
    inputToken,
    outputToken,
    response,
    clmmPoolInfo,
    tickArrayCache: tickCache[poolAddress],
    price
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
  const { inputToken, outputToken, response } = await getSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress,
    slippagePct
  );
  
  logger.info(`Raydium CLMM swap quote: ${side} ${amount} ${baseTokenSymbol}/${quoteTokenSymbol} in pool ${poolAddress}`, {
    inputToken: inputToken.symbol,
    outputToken: outputToken.symbol,
    responseType: side === 'BUY' ? 'ReturnTypeComputeAmountOutBaseOut' : 'ReturnTypeComputeAmountOutFormat',
    response: side === 'BUY' 
      ? {
          amountIn: { amount: (response as ReturnTypeComputeAmountOutBaseOut).amountIn.amount.toNumber() },
          maxAmountIn: { amount: (response as ReturnTypeComputeAmountOutBaseOut).maxAmountIn.amount.toNumber() },
          realAmountOut: { amount: (response as ReturnTypeComputeAmountOutBaseOut).realAmountOut.amount.toNumber() },
          currentPrice: (response as ReturnTypeComputeAmountOutBaseOut).currentPrice,
          executionPrice: (response as ReturnTypeComputeAmountOutBaseOut).executionPrice,
          priceImpact: {
            numerator: (response as ReturnTypeComputeAmountOutBaseOut).priceImpact.numerator.toNumber(),
            denominator: (response as ReturnTypeComputeAmountOutBaseOut).priceImpact.denominator.toNumber()
          },
          fee: (response as ReturnTypeComputeAmountOutBaseOut).fee.toNumber(),
          remainingAccounts: (response as ReturnTypeComputeAmountOutBaseOut).remainingAccounts
        }
      : response
  });

  if (side === 'BUY') {
    const exactOutResponse = response as ReturnTypeComputeAmountOutBaseOut;
    const estimatedAmountIn = exactOutResponse.amountIn.amount.toNumber() / 10 ** (outputToken.decimals + (outputToken.decimals - inputToken.decimals));
    const maxAmountIn = exactOutResponse.maxAmountIn.amount.toNumber() / 10 ** (outputToken.decimals + (outputToken.decimals - inputToken.decimals));
    const amountOut = exactOutResponse.realAmountOut.amount.toNumber() / 10 ** outputToken.decimals;

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
    const exactInResponse = response as ReturnTypeComputeAmountOutFormat;
    const estimatedAmountIn = exactInResponse.realAmountIn.amount.raw.toNumber() / 10 ** inputToken.decimals;
    const estimatedAmountOut = exactInResponse.amountOut.amount.raw.toNumber() / 10 ** outputToken.decimals;
    const minAmountOut = exactInResponse.minAmountOut.amount.raw.toNumber() / 10 ** outputToken.decimals;

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
        description: 'Get swap quote for Raydium CLMM',
        tags: ['raydium-clmm'],
        querystring:{ 
          ...GetCLMMSwapQuoteRequest,
          properties: {
            ...GetCLMMSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: ['3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'] },
            slippagePct: { type: 'number', examples: [1] }
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
        throw fastify.httpErrors.internalServerError('Failed to get swap quote');
      }
    }
  );
};

export default quoteSwapRoute;

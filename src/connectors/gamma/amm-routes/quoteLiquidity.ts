import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Gamma } from '../gamma';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { 
  QuoteLiquidityRequest,
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType,
} from '../../../schemas/amm-schema';
import BN from 'bn.js';
import { Percent } from 'goosefx-amm-sdk';

interface CpmmComputePairResult {
  anotherAmount: { amount: BN };
  maxAnotherAmount: { amount: BN };
  liquidity: BN;
  inputAmountFee: { amount: BN };
}

export async function quoteLiquidity(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number
): Promise<QuoteLiquidityResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const gamma = await Gamma.getInstance(network);

    const { poolInfo, poolKeys, rpcData } = await gamma.client.cpmm.getPoolInfoFromRpc(poolAddress)
    if (!rpcData || !poolKeys || !rpcData) {
      throw new Error(`Pool not found: ${poolAddress}`)
    }

    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

    if (!baseTokenAmount && !quoteTokenAmount) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const baseAmount = baseTokenAmount?.toString();
    const quoteAmount = quoteTokenAmount?.toString();

    const epochInfo = await solana.connection.getEpochInfo();
    // Convert percentage to basis points (multiply by 100 to handle decimals)
    // e.g., 0.5% becomes 50/10000, 0% becomes 0/10000
    const slippage = new Percent(
      Math.floor(((slippagePct === 0 ? 0 : slippagePct || gamma.getSlippagePct('amm')) * 100) / 10000)
    );

    let resBase: CpmmComputePairResult | undefined = undefined;
    if (baseAmount) {
      resBase = gamma.client.cpmm.computePairAmount({
        poolInfo,
        amount: baseAmount,
        baseSpecified: true,
        slippage: slippage,
        epochInfo: epochInfo,
        baseReserve: rpcData.baseReserve,
        quoteReserve: rpcData.quoteReserve,
      })
    }

    let resQuote: CpmmComputePairResult | undefined = undefined;
    if (quoteAmount) {
      resQuote = gamma.client.cpmm.computePairAmount({
        poolInfo,
        amount: quoteAmount,
        baseSpecified: false,
        slippage: slippage,
        epochInfo: epochInfo,
        baseReserve: rpcData.baseReserve,
        quoteReserve: rpcData.quoteReserve,
      })
    }

    const useBaseResult = resBase && (!resQuote || resBase.liquidity.lte(resQuote.liquidity));
    const cpmmRes = useBaseResult ? resBase as CpmmComputePairResult : resQuote as CpmmComputePairResult;
    const isBaseIn = useBaseResult;
    
    const resParsed = { 
      anotherAmount: Number(cpmmRes.anotherAmount.amount.toString()),
      maxAnotherAmount: Number(cpmmRes.maxAnotherAmount.amount.toString()),
      anotherAmountToken: isBaseIn ? baseToken.symbol : quoteToken.symbol,
      maxAnotherAmountToken: isBaseIn ? baseToken.symbol : quoteToken.symbol,
      liquidity: cpmmRes.liquidity.toString(),
    }
    console.log('resParsed:cpmm', resParsed);
    if (isBaseIn) {
      return {
        baseLimited: true,
        baseTokenAmount: baseTokenAmount,
        quoteTokenAmount: resParsed.anotherAmount / 10 ** quoteToken.decimals,
        baseTokenAmountMax: baseTokenAmount,
        quoteTokenAmountMax: resParsed.maxAnotherAmount / 10 ** quoteToken.decimals,
      };
    } else {
      return {
        baseLimited: false,
        baseTokenAmount: resParsed.anotherAmount / 10 ** baseToken.decimals,
        quoteTokenAmount: quoteTokenAmount,
        baseTokenAmountMax: resParsed.maxAnotherAmount / 10 ** baseToken.decimals,
        quoteTokenAmountMax: quoteTokenAmount,
      };
    }

  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType | { error: string };
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Quote amounts for a new Gamma AMM liquidity position',
        tags: ['gamma/amm'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: { type: 'string', examples: ['Hjm1F98vgVdN7Y9L46KLqcZZWyTKS9tj9ybYKJcXnSng'] }, // SOL-USDC
            baseTokenAmount: { type: 'number', examples: [1] },
            quoteTokenAmount: { type: 'number', examples: [1] },
            slippagePct: { type: 'number', examples: [1] },
          }
        },
        response: {
          200: QuoteLiquidityResponse,
          500: { 
            type: 'object',
            properties: { error: { type: 'string' } }
          }
        },
      },
    },
    async (request) => {
      try {
        const { 
          network = 'mainnet-beta',
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.query;

        return await quoteLiquidity(
          fastify,
          network,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    }
  );
};

export default quoteLiquidityRoute;
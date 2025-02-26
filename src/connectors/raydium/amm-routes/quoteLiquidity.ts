import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Raydium } from '../raydium';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { 
  QuoteLiquidityRequest,
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType,
} from '../../../services/amm-interfaces';
import { isValidAmm, isValidCpmm } from '../raydium.utils';
import BN from 'bn.js';
import { ApiV3PoolInfoStandardItemCpmm, ApiV3PoolInfoStandardItem, Percent, TokenAmount } from '@raydium-io/raydium-sdk-v2';

interface AmmComputePairResult {
  anotherAmount: TokenAmount;
  maxAnotherAmount: TokenAmount;
  liquidity: BN;
}

interface CpmmComputePairResult {
  anotherAmount: { amount: BN };
  maxAnotherAmount: { amount: BN };
  liquidity: BN;
  inputAmountFee: { amount: BN };
}

// Add helper function to parse values
function parseAmmResult(result: AmmComputePairResult) {
  return {
    anotherAmount: Number(result.anotherAmount.numerator.toString()) / Number(result.anotherAmount.denominator.toString()),
    maxAnotherAmount: Number(result.maxAnotherAmount.numerator.toString()) / Number(result.maxAnotherAmount.denominator.toString()),
    anotherTokenSymbol: result.anotherAmount.token.symbol,
    liquidity: result.liquidity.toString()
  };
}

function parseCpmmResult(result: CpmmComputePairResult, tokenDecimals: number) {
  return {
    anotherAmount: Number(result.anotherAmount.amount.toString()) / (10 ** tokenDecimals),
    maxAnotherAmount: Number(result.maxAnotherAmount.amount.toString()) / (10 ** tokenDecimals),
    inputFee: Number(result.inputAmountFee.amount.toString()) / (10 ** tokenDecimals),
    liquidity: result.liquidity.toString()
  };
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
    const raydium = await Raydium.getInstance(network);

    const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolAddress);
    const programId = poolInfo.programId; 

    if (!isValidAmm(programId) && !isValidCpmm(programId)) {
      throw new Error('Target pool is not AMM or CPMM pool')
    }

    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

    const baseAmount = baseTokenAmount.toString();
    const quoteAmount = quoteTokenAmount.toString();

    if (!baseAmount && !quoteAmount) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const epochInfo = await solana.connection.getEpochInfo();
    // Convert percentage to basis points (multiply by 100 to handle decimals)
    // e.g., 0.5% becomes 50/10000, 0% becomes 0/10000
    const slippage = new Percent(
      Math.floor(((slippagePct === 0 ? 0 : slippagePct || raydium.getSlippagePct())) * 100), 
      10000
    );

    const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);

    let resBase: AmmComputePairResult | CpmmComputePairResult;
    if (ammPoolInfo.poolType === 'amm') {
      resBase = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        amount: baseAmount,
        baseIn: true,
        slippage: slippage, // 1%
      })
      console.log('resBase parsed:', parseAmmResult(resBase as AmmComputePairResult));
    } else if (ammPoolInfo.poolType === 'cpmm') {
      const rawPool = await raydium.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress])
      resBase = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        amount: baseAmount,
        baseReserve: new BN(rawPool[poolAddress].baseReserve),
        quoteReserve: new BN(rawPool[poolAddress].quoteReserve),
        slippage: slippage,
        baseIn: true,
        epochInfo: epochInfo,
      })
      console.log('resBase:', parseCpmmResult(resBase as CpmmComputePairResult, quoteToken.decimals));
    }

    let resQuote: AmmComputePairResult | CpmmComputePairResult;
    if (ammPoolInfo.poolType === 'amm') {
      resQuote = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        amount: quoteAmount,
        baseIn: false,
        slippage: slippage, // 1%
      })
      console.log('resQuote parsed:', parseAmmResult(resQuote as AmmComputePairResult));
    } else if (ammPoolInfo.poolType === 'cpmm') {
      const rawPool = await raydium.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress])
      resQuote = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        amount: quoteAmount,
        baseReserve: new BN(rawPool[poolAddress].baseReserve),
        quoteReserve: new BN(rawPool[poolAddress].quoteReserve),
        slippage: slippage,
        baseIn: false,
        epochInfo: epochInfo,
      })
      console.log('resQuote:', parseCpmmResult(resQuote as CpmmComputePairResult, baseToken.decimals));
    }

    // Parse the result differently for AMM and CPMM
    if (ammPoolInfo.poolType === 'amm') {
      // Handle AMM case separately
      const useBaseResult = resBase.liquidity.lte(resQuote.liquidity);
      const ammRes = useBaseResult ? resBase as AmmComputePairResult : resQuote as AmmComputePairResult;
      const isBaseIn = useBaseResult;
      
      const resParsed = {
        anotherAmount: Number(ammRes.anotherAmount.numerator.toString()) / Number(ammRes.anotherAmount.denominator.toString()),
        maxAnotherAmount: Number(ammRes.maxAnotherAmount.numerator.toString()) / Number(ammRes.maxAnotherAmount.denominator.toString()),
        anotherAmountToken: ammRes.anotherAmount.token.symbol,
        maxAnotherAmountToken: ammRes.maxAnotherAmount.token.symbol,
        liquidity: ammRes.liquidity.toString(),
        poolType: ammPoolInfo.poolType,
        baseIn: isBaseIn,
      };
      
      console.log('resParsed:amm', resParsed);
  
      if (isBaseIn) {
        return {
          baseLimited: true,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: resParsed.anotherAmount,
          baseTokenAmountMax: baseTokenAmount,
          quoteTokenAmountMax: resParsed.maxAnotherAmount,
        };
      } else {
        return {
          baseLimited: false,
          baseTokenAmount: resParsed.anotherAmount,
          quoteTokenAmount: quoteTokenAmount,
          baseTokenAmountMax: resParsed.maxAnotherAmount,
          quoteTokenAmountMax: quoteTokenAmount,
        };
      }

    } else if (ammPoolInfo.poolType === 'cpmm') {
      // Handle CPMM case
      const useBaseResult = resBase.liquidity.lte(resQuote.liquidity);
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
        description: 'Quote amounts for a new Raydium AMM liquidity position',
        tags: ['raydium-amm'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: { type: 'string', examples: ['6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'] }, // AMM RAY-USDC
            // poolAddress: { type: 'string', examples: ['7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny'] }, // CPMM SOL-USDC
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
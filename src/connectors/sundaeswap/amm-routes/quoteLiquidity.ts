import { IPoolData } from '@aiquant/sundaeswap-core';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { CardanoToken } from '#src/tokens/types';

import {
  QuoteLiquidityRequestType,
  QuoteLiquidityRequest,
  QuoteLiquidityResponseType,
  QuoteLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';
import { formatTokenAmount } from '../sundaeswap.utils';

export async function getSundaeswapAmmLiquidityQuote(
  network: string,
  poolAddress?: string,
  baseToken?: CardanoToken,
  quoteToken?: CardanoToken,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  _slippagePct?: number,
): Promise<{
  baseLimited: boolean;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseTokenAmountMax: number;
  quoteTokenAmountMax: number;
  baseToken: CardanoToken;
  quoteToken: CardanoToken;
  poolAddress?: string;
  rawBaseTokenAmount: string;
  rawQuoteTokenAmount: string;
  poolData: IPoolData;
}> {
  const networkToUse = network || 'mainnet';

  if (!baseToken || !quoteToken) {
    throw new Error('Base token and quote token are required');
  }
  if (baseTokenAmount === undefined && quoteTokenAmount === undefined) {
    throw new Error('At least one token amount must be provided');
  }

  const sundaeswap = await Sundaeswap.getInstance(networkToUse);

  let poolAddressToUse = poolAddress;
  let existingPool = true;
  if (!poolAddressToUse) {
    poolAddressToUse = await sundaeswap.findDefaultPool(baseToken.symbol, quoteToken.symbol, 'amm');
    if (!poolAddressToUse) {
      existingPool = false;
      logger.info(`No existing pool found for ${baseToken}-${quoteToken}, providing theoretical quote`);
    }
  }

  let baseTokenAmountOptimal = baseTokenAmount!;
  let quoteTokenAmountOptimal = quoteTokenAmount!;
  let baseLimited = false;
  let poolState: IPoolData;

  if (existingPool) {
    poolState = await sundaeswap.getPoolData(poolAddressToUse);

    if (!poolState) {
      throw new Error(`Unable to load pool ${poolAddressToUse}`);
    }

    // Handle SundaeSwap's specific asset ID format
    const baseTokenId =
      baseToken.symbol === 'ADA'
        ? 'ada.lovelace' // SundaeSwap format for ADA
        : `${baseToken.policyId}.${baseToken.assetName}`; // SundaeSwap format for other tokens

    const quoteTokenId =
      quoteToken.symbol === 'ADA'
        ? 'ada.lovelace' // SundaeSwap format for ADA
        : `${quoteToken.policyId}.${quoteToken.assetName}`; // SundaeSwap format for other tokens

    // Get asset IDs from pool data
    const assetAId = poolState.assetA.assetId.trim();
    const assetBId = poolState.assetB.assetId.trim();

    let baseReserve: bigint;
    let quoteReserve: bigint;

    if (baseTokenId === assetAId) {
      // Base token is assetA, quote token is assetB
      baseReserve = BigInt(poolState.liquidity.aReserve || 0);
      quoteReserve = BigInt(poolState.liquidity.bReserve || 0);
    } else if (baseTokenId === assetBId) {
      // Base token is assetB, quote token is assetA
      baseReserve = BigInt(poolState.liquidity.bReserve || 0);
      quoteReserve = BigInt(poolState.liquidity.aReserve || 0);
    } else {
      throw new Error(`Base token ${baseToken.symbol} not found in pool`);
    }

    // Convert user inputs into raw bigints
    const baseRaw = baseTokenAmount ? BigInt(Math.floor(baseTokenAmount * 10 ** baseToken.decimals).toString()) : null;
    const quoteRaw = quoteTokenAmount
      ? BigInt(Math.floor(quoteTokenAmount * 10 ** quoteToken.decimals).toString())
      : null;

    // Compute the "optimal" opposite amount
    if (baseRaw !== null && quoteRaw !== null) {
      // both sides provided → pick the limiting one
      const quoteOptimal = (baseRaw * quoteReserve) / baseReserve;
      if (quoteOptimal <= quoteRaw) {
        baseLimited = true;
        quoteTokenAmountOptimal = Number(formatTokenAmount(quoteOptimal.toString(), quoteToken.decimals));
      } else {
        baseLimited = false;
        const baseOptimal = (quoteRaw * baseReserve) / quoteReserve;
        baseTokenAmountOptimal = Number(formatTokenAmount(baseOptimal.toString(), baseToken.decimals));
      }
    } else if (baseRaw !== null) {
      // only base provided
      const quoteOptimal = baseReserve === BigInt(0) ? BigInt(0) : (baseRaw * quoteReserve) / baseReserve;
      quoteTokenAmountOptimal = Number(formatTokenAmount(quoteOptimal.toString(), quoteToken.decimals));
      baseLimited = true;
    } else if (quoteRaw !== null) {
      // only quote provided
      const baseOptimal = quoteReserve === BigInt(0) ? BigInt(0) : (quoteRaw * baseReserve) / quoteReserve;
      baseTokenAmountOptimal = Number(formatTokenAmount(baseOptimal.toString(), baseToken.decimals));
      baseLimited = false;
    }
  } else {
    // new pool → must supply both
    if (baseTokenAmount == null || quoteTokenAmount == null) {
      throw new Error('For a new pool, you must supply both baseTokenAmount and quoteTokenAmount');
    }
    baseLimited = false; // arbitrary; both get used
  }

  // Convert back to raw amounts
  const rawBaseTokenAmount = Math.floor(baseTokenAmountOptimal * 10 ** baseToken.decimals).toString();
  const rawQuoteTokenAmount = Math.floor(quoteTokenAmountOptimal * 10 ** quoteToken.decimals).toString();

  return {
    baseLimited,
    baseTokenAmount: baseTokenAmountOptimal,
    quoteTokenAmount: quoteTokenAmountOptimal,
    baseTokenAmountMax: baseTokenAmount ?? baseTokenAmountOptimal,
    quoteTokenAmountMax: quoteTokenAmount ?? quoteTokenAmountOptimal,
    baseToken,
    quoteToken,
    poolAddress: poolAddressToUse,
    rawBaseTokenAmount,
    rawQuoteTokenAmount,
    poolData: poolState,
  };
}

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get liquidity quote for Sundaeswap',
        tags: ['/connector/sundaeswap/amm'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['SUNDAE'] },
            baseTokenAmount: { type: 'number', examples: [0.029314] },
            quoteTokenAmount: { type: 'number', examples: [1] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: QuoteLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.query;

        const sundaeswap = await Sundaeswap.getInstance(network);

        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('poolAddress must be provided');
        }

        const poolInfo = await sundaeswap.getAmmPoolInfo(poolAddress);

        const baseTokenAddress = poolInfo.baseTokenAddress;
        const quoteTokenAddress = poolInfo.quoteTokenAddress;

        const baseToken = await sundaeswap.cardano.getTokenByAddress(baseTokenAddress);
        const quoteToken = await sundaeswap.cardano.getTokenByAddress(quoteTokenAddress);

        const quote = await getSundaeswapAmmLiquidityQuote(
          network,
          poolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );

        return {
          baseLimited: quote.baseLimited,
          baseTokenAmount: quote.baseTokenAmount,
          quoteTokenAmount: quote.quoteTokenAmount,
          baseTokenAmountMax: quote.baseTokenAmountMax,
          quoteTokenAmountMax: quote.quoteTokenAmountMax,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get liquidity quote');
      }
    },
  );
};

export default quoteLiquidityRoute;

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
import { Minswap } from '../minswap';
import { formatTokenAmount } from '../minswap.utils';

export async function getMinswapAmmLiquidityQuote(
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
  baseTokenObj: CardanoToken;
  quoteTokenObj: CardanoToken;
  poolAddress?: string;
  rawBaseTokenAmount: BigNumber;
  rawQuoteTokenAmount: BigNumber;
  routerAddress: string;
}> {
  const networkToUse = network || 'mainnet';

  if (!baseToken || !quoteToken) {
    throw new Error('Base token and quote token are required');
  }
  if (baseTokenAmount === undefined && quoteTokenAmount === undefined) {
    throw new Error('At least one token amount must be provided');
  }

  const minswap = await Minswap.getInstance(networkToUse);

  let poolAddressToUse = poolAddress;
  let existingPool = true;
  if (!poolAddressToUse) {
    poolAddressToUse = await minswap.findDefaultPool(baseToken.symbol, quoteToken.symbol, 'amm');
    if (!poolAddressToUse) {
      existingPool = false;
      logger.info(`No existing pool found for ${baseToken}-${quoteToken}, providing theoretical quote`);
    }
  }

  let baseTokenAmountOptimal = baseTokenAmount!;
  let quoteTokenAmountOptimal = quoteTokenAmount!;
  let baseLimited = false;

  if (existingPool) {
    const { poolState, poolDatum } = await minswap.getPoolData(poolAddressToUse);

    if (!poolState) {
      throw new Error(`Unable to load pool ${poolAddressToUse}`);
    }

    // Map reserves based on actual token addresses
    const baseTokenId = baseToken.symbol === 'ADA' ? 'lovelace' : baseToken.policyId + baseToken.assetName;
    const quoteTokenId = quoteToken.symbol === 'ADA' ? 'lovelace' : quoteToken.policyId + quoteToken.assetName;

    let baseReserve: bigint;
    let quoteReserve: bigint;

    if (baseTokenId === poolState.assetA) {
      baseReserve = poolState.reserveA;
      quoteReserve = poolState.reserveB;
    } else if (baseTokenId === poolState.assetB) {
      baseReserve = poolState.reserveB;
      quoteReserve = poolState.reserveA;
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

  // Convert back into Ethers BigNumber for any on‐chain tx
  const rawBaseTokenAmount = BigNumber.from(Math.floor(baseTokenAmountOptimal * 10 ** baseToken.decimals).toString());
  const rawQuoteTokenAmount = BigNumber.from(
    Math.floor(quoteTokenAmountOptimal * 10 ** quoteToken.decimals).toString(),
  );

  return {
    baseLimited,
    baseTokenAmount: baseTokenAmountOptimal,
    quoteTokenAmount: quoteTokenAmountOptimal,
    baseTokenAmountMax: baseTokenAmount ?? baseTokenAmountOptimal,
    quoteTokenAmountMax: quoteTokenAmount ?? quoteTokenAmountOptimal,
    baseTokenObj: baseToken,
    quoteTokenObj: quoteToken,
    poolAddress: poolAddressToUse,
    rawBaseTokenAmount,
    rawQuoteTokenAmount,
    routerAddress: 'N/A',
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
        description: 'Get liquidity quote for Minswap',
        tags: ['/connector/minswap/amm'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
            baseTokenAmount: { type: 'number', examples: [0.029314] },
            quoteTokenAmount: { type: 'number', examples: [1] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: QuoteLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.query;

        const minswap = await Minswap.getInstance(network);

        // Check if poolAddress is provided
        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('poolAddress must be provided');
        }

        const poolInfo = await minswap.getAmmPoolInfo(poolAddress);

        const baseTokenAddress = poolInfo.baseTokenAddress;
        const quoteTokenAddress = poolInfo.quoteTokenAddress;
        // Find token symbol from token address
        const baseToken = await minswap.cardano.getTokenByAddress(baseTokenAddress);
        const quoteToken = await minswap.cardano.getTokenByAddress(quoteTokenAddress);

        const quote = await getMinswapAmmLiquidityQuote(
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

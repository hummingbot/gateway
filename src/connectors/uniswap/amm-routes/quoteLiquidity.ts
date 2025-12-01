import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  QuoteLiquidityRequestType,
  QuoteLiquidityRequest,
  QuoteLiquidityResponseType,
  QuoteLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { IUniswapV2PairABI, getUniswapV2RouterAddress } from '../uniswap.contracts';
import { formatTokenAmount, getUniswapPoolInfo } from '../uniswap.utils';

export async function getUniswapAmmLiquidityQuote(
  network: string,
  poolAddress?: string,
  baseToken?: string,
  quoteToken?: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  _slippagePct?: number,
): Promise<{
  baseLimited: boolean;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseTokenAmountMax: number;
  quoteTokenAmountMax: number;
  baseTokenObj: any;
  quoteTokenObj: any;
  poolAddress?: string;
  rawBaseTokenAmount: BigNumber;
  rawQuoteTokenAmount: BigNumber;
  routerAddress: string;
}> {
  const networkToUse = network;

  // Validate essential parameters
  if (!baseToken || !quoteToken) {
    throw new Error('Base token and quote token are required');
  }

  if (baseTokenAmount === undefined && quoteTokenAmount === undefined) {
    throw new Error('At least one token amount must be provided');
  }

  // Get Uniswap and Ethereum instances
  const uniswap = await Uniswap.getInstance(networkToUse);
  const ethereum = await Ethereum.getInstance(networkToUse);

  // Resolve tokens from local token list
  const baseTokenObj = await uniswap.getToken(baseToken);
  const quoteTokenObj = await uniswap.getToken(quoteToken);

  if (!baseTokenObj || !quoteTokenObj) {
    throw new Error(`Token not found: ${!baseTokenObj ? baseToken : quoteToken}`);
  }

  // Find pool address if not provided
  let poolAddressToUse = poolAddress;
  let existingPool = true;

  if (!poolAddressToUse) {
    poolAddressToUse = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');

    if (!poolAddressToUse) {
      existingPool = false;
      logger.info(`No existing pool found for ${baseToken}-${quoteToken}, providing theoretical quote`);
    }
  }

  let baseTokenAmountOptimal = baseTokenAmount;
  let quoteTokenAmountOptimal = quoteTokenAmount;
  let baseLimited = false;

  if (existingPool) {
    // Get existing pool data to calculate optimal amounts
    const pairContract = new Contract(poolAddressToUse, IUniswapV2PairABI.abi, ethereum.provider);

    // Get token addresses and reserves
    const [token0, token1, reserves] = await Promise.all([
      pairContract.token0(),
      pairContract.token1(),
      pairContract.getReserves(),
    ]);

    // Determine which token is base and which is quote
    const token0IsBase = token0.toLowerCase() === baseTokenObj.address.toLowerCase();

    const reserve0 = reserves[0];
    const reserve1 = reserves[1];

    const baseReserve = token0IsBase ? reserve0 : reserve1;
    const quoteReserve = token0IsBase ? reserve1 : reserve0;

    // Convert amounts to BigNumber with proper decimals
    const baseAmountRaw = baseTokenAmount
      ? BigNumber.from(Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString())
      : null;

    const quoteAmountRaw = quoteTokenAmount
      ? BigNumber.from(Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString())
      : null;

    // Calculate optimal amounts based on the reserves ratio
    if (baseAmountRaw && quoteAmountRaw) {
      // Both amounts provided, check which one is limiting
      const quoteOptimal = baseAmountRaw.mul(quoteReserve).div(baseReserve);

      if (quoteOptimal.lte(quoteAmountRaw)) {
        // Base token is the limiting factor
        baseLimited = true;
        quoteTokenAmountOptimal = formatTokenAmount(quoteOptimal.toString(), quoteTokenObj.decimals);
      } else {
        // Quote token is the limiting factor
        baseLimited = false;
        const baseOptimal = quoteAmountRaw.mul(baseReserve).div(quoteReserve);
        baseTokenAmountOptimal = formatTokenAmount(baseOptimal.toString(), baseTokenObj.decimals);
      }
    } else if (baseAmountRaw) {
      // Only base amount provided, calculate quote amount
      const quoteOptimal = baseReserve.isZero() ? BigNumber.from(0) : baseAmountRaw.mul(quoteReserve).div(baseReserve);

      quoteTokenAmountOptimal = formatTokenAmount(quoteOptimal.toString(), quoteTokenObj.decimals);
      baseLimited = true;
    } else if (quoteAmountRaw) {
      // Only quote amount provided, calculate base amount
      const baseOptimal = quoteReserve.isZero() ? BigNumber.from(0) : quoteAmountRaw.mul(baseReserve).div(quoteReserve);

      baseTokenAmountOptimal = formatTokenAmount(baseOptimal.toString(), baseTokenObj.decimals);
      baseLimited = false;
    }
  } else {
    // No existing pool, the ratio will be set by the first liquidity provider
    if (baseTokenAmount && quoteTokenAmount) {
      // Both amounts provided, keeping them as is
      baseLimited = false;
    } else if (baseTokenAmount) {
      // Only base amount provided, need quote amount
      throw new Error('For new pools, both base and quote token amounts must be provided');
    } else if (quoteTokenAmount) {
      // Only quote amount provided, need base amount
      throw new Error('For new pools, both base and quote token amounts must be provided');
    }
  }

  // Get router address
  const routerAddress = getUniswapV2RouterAddress(networkToUse);

  // Convert final amounts to raw values for execution
  const rawBaseTokenAmount = BigNumber.from(
    Math.floor(baseTokenAmountOptimal * Math.pow(10, baseTokenObj.decimals)).toString(),
  );

  const rawQuoteTokenAmount = BigNumber.from(
    Math.floor(quoteTokenAmountOptimal * Math.pow(10, quoteTokenObj.decimals)).toString(),
  );

  return {
    baseLimited,
    baseTokenAmount: baseTokenAmountOptimal,
    quoteTokenAmount: quoteTokenAmountOptimal,
    baseTokenAmountMax: baseTokenAmount || baseTokenAmountOptimal,
    quoteTokenAmountMax: quoteTokenAmount || quoteTokenAmountOptimal,
    baseTokenObj,
    quoteTokenObj,
    poolAddress: poolAddressToUse,
    rawBaseTokenAmount,
    rawQuoteTokenAmount,
    routerAddress,
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
        description: 'Get liquidity quote for a Uniswap V2 pool',
        tags: ['/connector/uniswap'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            baseTokenAmount: { type: 'number', examples: [0.001] },
            quoteTokenAmount: { type: 'number', examples: [2.5] },
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

        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('Pool address is required');
        }

        // Get pool information to determine tokens
        const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'amm');
        if (!poolInfo) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        const baseToken = poolInfo.baseTokenAddress;
        const quoteToken = poolInfo.quoteTokenAddress;

        const quote = await getUniswapAmmLiquidityQuote(
          network,
          poolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );

        // Use standard gas limit for liquidity operations
        const computeUnits = 500000;

        return {
          baseLimited: quote.baseLimited,
          baseTokenAmount: quote.baseTokenAmount,
          quoteTokenAmount: quote.quoteTokenAmount,
          baseTokenAmountMax: quote.baseTokenAmountMax,
          quoteTokenAmountMax: quote.quoteTokenAmountMax,
          computeUnits,
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

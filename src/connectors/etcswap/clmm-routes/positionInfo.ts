import { Token } from '@etcswapv2/sdk-core';
import { Position, tickToPrice, computePoolAddress } from '@etcswapv3/sdk';
import { Contract } from '@ethersproject/contracts';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetPositionInfoRequestType,
  GetPositionInfoRequest,
  PositionInfo,
  PositionInfoSchema,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { ETCswap } from '../etcswap';
import {
  POSITION_MANAGER_ABI,
  getETCswapV3NftManagerAddress,
  getETCswapV3FactoryAddress,
  ETCSWAP_V3_INIT_CODE_HASH,
} from '../etcswap.contracts';
import { formatTokenAmount } from '../etcswap.utils';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const etcswap = await ETCswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position token ID is required');
  }

  // Check if V3 is available
  if (!etcswap.hasV3()) {
    throw fastify.httpErrors.badRequest(`V3 CLMM is not available on network: ${network}`);
  }

  // Get the position manager contract address
  const positionManagerAddress = getETCswapV3NftManagerAddress(network);

  // Create the position manager contract instance
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

  // Get position details by token ID
  const positionDetails = await positionManager.positions(positionAddress);

  // Get the token addresses from the position
  const token0Address = positionDetails.token0;
  const token1Address = positionDetails.token1;

  // Get the tokens from addresses
  const token0 = await etcswap.getToken(token0Address);
  const token1 = await etcswap.getToken(token1Address);

  if (!token0 || !token1) {
    throw fastify.httpErrors.notFound('Token information not found for position');
  }

  // Get position ticks
  const tickLower = positionDetails.tickLower;
  const tickUpper = positionDetails.tickUpper;
  const liquidity = positionDetails.liquidity;
  const fee = positionDetails.fee;

  // Get collected fees
  const feeAmount0 = formatTokenAmount(positionDetails.tokensOwed0.toString(), token0.decimals);
  const feeAmount1 = formatTokenAmount(positionDetails.tokensOwed1.toString(), token1.decimals);

  // Get the pool associated with the position
  const pool = await etcswap.getV3Pool(token0, token1, fee);
  if (!pool) {
    throw fastify.httpErrors.notFound('Pool not found for position');
  }

  // Calculate price range
  const lowerPrice = tickToPrice(token0, token1, tickLower).toSignificant(6);
  const upperPrice = tickToPrice(token0, token1, tickUpper).toSignificant(6);

  // Calculate current price
  const price = pool.token0Price.toSignificant(6);

  // Create a Position instance to calculate token amounts
  const position = new Position({
    pool,
    tickLower,
    tickUpper,
    liquidity: liquidity.toString(),
  });

  // Get token amounts in the position
  const token0Amount = formatTokenAmount(position.amount0.quotient.toString(), token0.decimals);
  const token1Amount = formatTokenAmount(position.amount1.quotient.toString(), token1.decimals);

  // Determine which token is base and which is quote
  // On ETCswap, use WETC as base, otherwise use lower address
  const isBaseToken0 =
    token0.symbol === 'WETC' ||
    (token1.symbol !== 'WETC' && token0.address.toLowerCase() < token1.address.toLowerCase());

  const [baseTokenAddress, quoteTokenAddress] = isBaseToken0
    ? [token0.address, token1.address]
    : [token1.address, token0.address];

  const [baseTokenAmount, quoteTokenAmount] = isBaseToken0
    ? [token0Amount, token1Amount]
    : [token1Amount, token0Amount];

  const [baseFeeAmount, quoteFeeAmount] = isBaseToken0 ? [feeAmount0, feeAmount1] : [feeAmount1, feeAmount0];

  // Get the actual pool address using computePoolAddress with ETCswap's INIT_CODE_HASH
  const poolAddress = computePoolAddress({
    factoryAddress: getETCswapV3FactoryAddress(network),
    tokenA: token0,
    tokenB: token1,
    fee,
    initCodeHashManualOverride: ETCSWAP_V3_INIT_CODE_HASH,
  });

  return {
    address: positionAddress,
    poolAddress,
    baseTokenAddress,
    quoteTokenAddress,
    baseTokenAmount,
    quoteTokenAmount,
    baseFeeAmount,
    quoteFeeAmount,
    lowerBinId: tickLower,
    upperBinId: tickUpper,
    lowerPrice: parseFloat(lowerPrice),
    upperPrice: parseFloat(upperPrice),
    price: parseFloat(price),
  };
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get position information for an ETCswap V3 position',
        tags: ['/connector/etcswap'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'classic' },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
              examples: ['1234'],
            },
          },
        },
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { network, positionAddress } = request.query;
        return await getPositionInfo(fastify, network, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get position info');
      }
    },
  );
};

export default positionInfoRoute;

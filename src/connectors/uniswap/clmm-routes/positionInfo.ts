import { Contract } from '@ethersproject/contracts';
import { Token } from '@uniswap/sdk-core';
import {
  Position,
  NonfungiblePositionManager,
  tickToPrice,
  computePoolAddress,
  FACTORY_ADDRESS,
} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetPositionInfoRequestType,
  GetPositionInfoRequest,
  PositionInfo,
  PositionInfoSchema,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { POSITION_MANAGER_ABI, getUniswapV3NftManagerAddress, getUniswapV3FactoryAddress } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position token ID is required');
  }

  // Get the position manager contract address
  const positionManagerAddress = getUniswapV3NftManagerAddress(network);

  // Create the position manager contract instance
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

  // Get position details by token ID
  const positionDetails = await positionManager.positions(positionAddress);

  // Get the token addresses from the position
  const token0Address = positionDetails.token0;
  const token1Address = positionDetails.token1;

  // Get the tokens from addresses
  const token0 = await uniswap.getToken(token0Address);
  const token1 = await uniswap.getToken(token1Address);

  // Get position ticks
  const tickLower = positionDetails.tickLower;
  const tickUpper = positionDetails.tickUpper;
  const liquidity = positionDetails.liquidity;
  const fee = positionDetails.fee;

  // Get collected fees
  const feeAmount0 = formatTokenAmount(positionDetails.tokensOwed0.toString(), token0.decimals);
  const feeAmount1 = formatTokenAmount(positionDetails.tokensOwed1.toString(), token1.decimals);

  // Get the pool associated with the position
  const pool = await uniswap.getV3Pool(token0, token1, fee);
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
  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  const [baseTokenAddress, quoteTokenAddress] = isBaseToken0
    ? [token0.address, token1.address]
    : [token1.address, token0.address];

  const [baseTokenAmount, quoteTokenAmount] = isBaseToken0
    ? [token0Amount, token1Amount]
    : [token1Amount, token0Amount];

  const [baseFeeAmount, quoteFeeAmount] = isBaseToken0 ? [feeAmount0, feeAmount1] : [feeAmount1, feeAmount0];

  // Get the actual pool address using computePoolAddress
  const poolAddress = computePoolAddress({
    factoryAddress: getUniswapV3FactoryAddress(network),
    tokenA: token0,
    tokenB: token1,
    fee,
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
        description: 'Get position information for a Uniswap V3 position',
        tags: ['/connector/uniswap'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'base' },
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

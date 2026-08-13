import { Contract } from '@ethersproject/contracts';
import { Position, PositionLibrary, tickToPrice, computePoolAddress } from '@pancakeswap/v3-sdk';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetPositionInfoRequestType,
  GetPositionInfoRequest,
  PositionInfo,
  PositionInfoSchema,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import {
  POSITION_MANAGER_ABI,
  getPancakeswapV3NftManagerAddress,
  getPancakeswapV3PoolDeployerAddress,
} from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

const POOL_STATE_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
      { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
      { internalType: 'bool', name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'feeGrowthGlobal0X128',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'feeGrowthGlobal1X128',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'int24', name: '', type: 'int24' }],
    name: 'ticks',
    outputs: [
      { internalType: 'uint128', name: 'liquidityGross', type: 'uint128' },
      { internalType: 'int128', name: 'liquidityNet', type: 'int128' },
      { internalType: 'uint256', name: 'feeGrowthOutside0X128', type: 'uint256' },
      { internalType: 'uint256', name: 'feeGrowthOutside1X128', type: 'uint256' },
      { internalType: 'int56', name: 'tickCumulativeOutside', type: 'int56' },
      { internalType: 'uint160', name: 'secondsPerLiquidityOutsideX128', type: 'uint160' },
      { internalType: 'uint32', name: 'secondsOutside', type: 'uint32' },
      { internalType: 'bool', name: 'initialized', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function getFeeGrowthInside(
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
  lowerFeeGrowthOutside0X128: bigint,
  lowerFeeGrowthOutside1X128: bigint,
  upperFeeGrowthOutside0X128: bigint,
  upperFeeGrowthOutside1X128: bigint,
  feeGrowthGlobal0X128: bigint,
  feeGrowthGlobal1X128: bigint,
): [bigint, bigint] {
  if (tickCurrent < tickLower) {
    return [
      lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128,
      lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128,
    ];
  }

  if (tickCurrent < tickUpper) {
    return [
      feeGrowthGlobal0X128 - lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128,
      feeGrowthGlobal1X128 - lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128,
    ];
  }

  return [
    upperFeeGrowthOutside0X128 - lowerFeeGrowthOutside0X128,
    upperFeeGrowthOutside1X128 - lowerFeeGrowthOutside1X128,
  ];
}

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const pancakeswap = await Pancakeswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position token ID is required');
  }

  const positionManagerAddress = getPancakeswapV3NftManagerAddress(network);
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);
  const positionDetails = await positionManager.positions(positionAddress);

  const token0Address = positionDetails.token0;
  const token1Address = positionDetails.token1;
  const token0 = await pancakeswap.getToken(token0Address);
  const token1 = await pancakeswap.getToken(token1Address);

  const tickLower = positionDetails.tickLower;
  const tickUpper = positionDetails.tickUpper;
  const liquidity = positionDetails.liquidity;
  const fee = positionDetails.fee;

  const pool = await pancakeswap.getV3Pool(token0, token1, fee);
  if (!pool) {
    throw fastify.httpErrors.notFound('Pool not found for position');
  }

  const poolAddress = computePoolAddress({
    deployerAddress: getPancakeswapV3PoolDeployerAddress(network),
    tokenA: token0,
    tokenB: token1,
    fee,
  });

  const poolContract = new Contract(poolAddress, POOL_STATE_ABI, ethereum.provider);
  const slot0 = await poolContract.slot0();
  const tickCurrent = Number(slot0.tick ?? slot0[1]);
  const lowerTick = await poolContract.ticks(tickLower);
  const upperTick = await poolContract.ticks(tickUpper);
  const feeGrowthGlobal0X128 = BigInt((await poolContract.feeGrowthGlobal0X128()).toString());
  const feeGrowthGlobal1X128 = BigInt((await poolContract.feeGrowthGlobal1X128()).toString());

  const lowerFeeGrowthOutside0X128 = BigInt((lowerTick.feeGrowthOutside0X128 ?? lowerTick[2]).toString());
  const lowerFeeGrowthOutside1X128 = BigInt((lowerTick.feeGrowthOutside1X128 ?? lowerTick[3]).toString());
  const upperFeeGrowthOutside0X128 = BigInt((upperTick.feeGrowthOutside0X128 ?? upperTick[2]).toString());
  const upperFeeGrowthOutside1X128 = BigInt((upperTick.feeGrowthOutside1X128 ?? upperTick[3]).toString());

  const [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
    tickCurrent,
    tickLower,
    tickUpper,
    lowerFeeGrowthOutside0X128,
    lowerFeeGrowthOutside1X128,
    upperFeeGrowthOutside0X128,
    upperFeeGrowthOutside1X128,
    feeGrowthGlobal0X128,
    feeGrowthGlobal1X128,
  );

  const feeGrowthInside0LastX128 = BigInt(positionDetails.feeGrowthInside0LastX128.toString());
  const feeGrowthInside1LastX128 = BigInt(positionDetails.feeGrowthInside1LastX128.toString());
  const liquidityBigInt = BigInt(positionDetails.liquidity.toString());
  const [deltaOwed0, deltaOwed1] = PositionLibrary.getTokensOwed(
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128,
    liquidityBigInt,
    feeGrowthInside0X128,
    feeGrowthInside1X128,
  );

  const totalOwed0 = BigInt(positionDetails.tokensOwed0.toString()) + deltaOwed0;
  const totalOwed1 = BigInt(positionDetails.tokensOwed1.toString()) + deltaOwed1;
  const feeAmount0 = formatTokenAmount(totalOwed0.toString(), token0.decimals);
  const feeAmount1 = formatTokenAmount(totalOwed1.toString(), token1.decimals);

  const lowerPrice = tickToPrice(token0, token1, tickLower).toSignificant(6);
  const upperPrice = tickToPrice(token0, token1, tickUpper).toSignificant(6);
  const price = pool.token0Price.toSignificant(6);

  const position = new Position({
    pool,
    tickLower,
    tickUpper,
    liquidity: liquidity.toString(),
  });

  const token0Amount = formatTokenAmount(position.amount0.quotient.toString(), token0.decimals);
  const token1Amount = formatTokenAmount(position.amount1.quotient.toString(), token1.decimals);

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
        description: 'Get position information for a Pancakeswap V3 position',
        tags: ['/connector/pancakeswap'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'bsc', examples: ['bsc'] },
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

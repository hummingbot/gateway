import { Contract } from '@ethersproject/contracts';
import { Position, tickToPrice, computePoolAddress } from '@pancakeswap/v3-sdk';
import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import {
  POSITION_MANAGER_ABI,
  getPancakeswapV3NftManagerAddress,
  getPancakeswapV3PoolDeployerAddress,
} from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Define the request and response types
const PositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ examples: ['bsc'], default: 'bsc' })),
  walletAddress: Type.String({ examples: ['<ethereum-wallet-address>'] }),
});

const PositionsOwnedResponse = Type.Array(PositionInfoSchema);

// Additional ABI methods needed for enumerating positions
const ENUMERABLE_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'uint256', name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress?: string,
): Promise<PositionInfo[]> {
  const pancakeswap = await Pancakeswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  if (!walletAddress) {
    walletAddress = await pancakeswap.getFirstWalletAddress();
    if (!walletAddress) {
      throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
    }
    logger.info(`Using first available wallet address: ${walletAddress}`);
  }

  const positionManagerAddress = getPancakeswapV3NftManagerAddress(network);
  const positionManager = new Contract(
    positionManagerAddress,
    [...ENUMERABLE_ABI, ...POSITION_MANAGER_ABI],
    ethereum.provider,
  );

  const balanceOf = await positionManager.balanceOf(walletAddress);
  const numPositions = balanceOf.toNumber();

  if (numPositions === 0) {
    return [];
  }

  const positions = [];
  for (let i = 0; i < numPositions; i++) {
    try {
      const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);
      const positionDetails = await positionManager.positions(tokenId);

      if (positionDetails.liquidity.eq(0)) {
        continue;
      }

      const token0 = await pancakeswap.getToken(positionDetails.token0);
      const token1 = await pancakeswap.getToken(positionDetails.token1);

      const pool = await pancakeswap.getV3Pool(token0, token1, positionDetails.fee);
      if (!pool) {
        logger.warn(`Pool not found for position ${tokenId}`);
        continue;
      }

      const position = new Position({
        pool,
        tickLower: positionDetails.tickLower,
        tickUpper: positionDetails.tickUpper,
        liquidity: positionDetails.liquidity.toString(),
      });

      const isBaseToken0 =
        token0.symbol === 'WETH' ||
        (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

      positions.push({
        address: tokenId.toString(),
        poolAddress: computePoolAddress({
          deployerAddress: getPancakeswapV3PoolDeployerAddress(network),
          tokenA: token0,
          tokenB: token1,
          fee: positionDetails.fee,
        }),
        baseTokenAddress: isBaseToken0 ? token0.address : token1.address,
        quoteTokenAddress: isBaseToken0 ? token1.address : token0.address,
        baseTokenAmount: formatTokenAmount(
          (isBaseToken0 ? position.amount0 : position.amount1).quotient.toString(),
          isBaseToken0 ? token0.decimals : token1.decimals,
        ),
        quoteTokenAmount: formatTokenAmount(
          (isBaseToken0 ? position.amount1 : position.amount0).quotient.toString(),
          isBaseToken0 ? token1.decimals : token0.decimals,
        ),
        baseFeeAmount: formatTokenAmount(
          (isBaseToken0 ? positionDetails.tokensOwed0 : positionDetails.tokensOwed1).toString(),
          isBaseToken0 ? token0.decimals : token1.decimals,
        ),
        quoteFeeAmount: formatTokenAmount(
          (isBaseToken0 ? positionDetails.tokensOwed1 : positionDetails.tokensOwed0).toString(),
          isBaseToken0 ? token1.decimals : token0.decimals,
        ),
        lowerBinId: positionDetails.tickLower,
        upperBinId: positionDetails.tickUpper,
        lowerPrice: parseFloat(tickToPrice(token0, token1, positionDetails.tickLower).toSignificant(6)),
        upperPrice: parseFloat(tickToPrice(token0, token1, positionDetails.tickUpper).toSignificant(6)),
        price: parseFloat(pool.token0Price.toSignificant(6)),
      });
    } catch (err) {
      logger.warn(`Error fetching position ${i} for wallet ${walletAddress}: ${err.message}`);
    }
  }

  return positions;
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.get<{
    Querystring: typeof PositionsOwnedRequest.static;
    Reply: typeof PositionsOwnedResponse.static;
  }>(
    '/positions-owned',
    {
      schema: {
        description: 'Get all Pancakeswap V3 positions owned by a wallet',
        tags: ['/connector/pancakeswap'],
        querystring: {
          ...PositionsOwnedRequest,
          properties: {
            ...PositionsOwnedRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
          },
        },
        response: {
          200: PositionsOwnedResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress } = request.query;
        const network = request.query.network;
        return await getPositionsOwned(fastify, network, walletAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to fetch positions');
      }
    },
  );
};

export default positionsOwnedRoute;

import { Contract } from '@ethersproject/contracts';
import { Position, tickToPrice, computePoolAddress } from '@pancakeswap/v3-sdk';
import { FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { PositionInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import {
  POSITION_MANAGER_ABI,
  getPancakeswapV3NftManagerAddress,
  getPancakeswapV3PoolDeployerAddress,
} from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

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

      // Zero-liquidity positions are reported, not skipped. The NFT is still
      // owned and still counted by balanceOf, it can hold uncollected
      // tokensOwed after a decrease, and it can be increased again or burned.
      // Callers that want only active liquidity filter on it themselves.

      const token0 = await pancakeswap.getToken(positionDetails.token0);
      const token1 = await pancakeswap.getToken(positionDetails.token1);

      const pool = await pancakeswap.getV3Pool(token0, token1, positionDetails.fee);
      if (!pool) {
        throw new Error(`pool not found for ${token0.symbol}-${token1.symbol} at fee tier ${positionDetails.fee}`);
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
      // Do not swallow this. A failure here is indistinguishable from the
      // position not existing, so returning the rest would hand the caller a
      // silently short list — and callers size new exposure against it.
      throw fastify.httpErrors.internalServerError(
        `Failed to read position ${i + 1} of ${numPositions} for wallet ${walletAddress}: ${err.message}`,
      );
    }
  }

  // Index-based enumeration is only consistent if the wallet's balance did not
  // change mid-scan. If it did, the list is not the inventory it claims to be.
  if (positions.length !== numPositions) {
    throw fastify.httpErrors.internalServerError(
      `Resolved ${positions.length} positions but balanceOf reported ${numPositions} for wallet ` +
        `${walletAddress}; the wallet's positions likely changed during enumeration. Retry.`,
    );
  }

  return positions;
}

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
      // A wallet that loses a position mid-scan renumbers underneath this loop: the
      // enumerable bookkeeping swap-and-pops on removal, so an index that was inside the
      // set when balanceOf was read can fall off the end, and a tokenId read a moment ago
      // can stop existing before positions() is asked about it. Verified against the
      // mainnet position manager: the first reverts with "EnumerableSet: index out of
      // bounds", the second with "Invalid token ID".
      //
      // That is the caller's own concurrent close, not a Gateway fault. Reporting the raw
      // revert as a 500 reads like a bug in here and tells them nothing; a conflict says
      // what happened and that the request is worth repeating.
      const revert = err.message ?? '';
      if (revert.includes('index out of bounds') || revert.includes('Invalid token ID')) {
        throw fastify.httpErrors.conflict(
          `Wallet ${walletAddress} lost a position while its ${numPositions} positions were being listed. Retry.`,
        );
      }

      // Do not swallow anything else. A failure here is indistinguishable from the
      // position not existing, so returning the rest would hand the caller a
      // silently short list — and callers size new exposure against it.
      throw fastify.httpErrors.internalServerError(
        `Failed to read position ${i + 1} of ${numPositions} for wallet ${walletAddress}: ${err.message}`,
      );
    }
  }

  // No final balanceOf comparison. A count check cannot say what it appears to say, and
  // the version that was here rejected correct answers to do it.
  //
  // Enumeration is EnumerableSet-backed, which appends on add and swap-and-pops on remove.
  // So a position ADDED mid-scan cannot disturb indices 0..N-1 — the loop reads exactly the
  // set that existed when the request arrived, and the list it returns is a correct
  // snapshot. A count check sees N+1 against N and throws that correct snapshot away, which
  // for a wallet that opens positions while polling this route is the common case, not the
  // edge. A position REMOVED mid-scan is caught by the loop itself, above: the index walks
  // off the end, or the tokenId stops existing, and either way the pass throws.
  //
  // What neither catches is a change that lands after the loop's last read. That window is
  // narrow and closing it needs atomicity, not arithmetic — pinning every read to one
  // blockTag, at which point nothing here has to be inferred. Deliberately not done: a
  // pinned read against the load-balanced public RPCs Gateway defaults to can land on a
  // node that has not yet seen that block, trading a rare stale list for a routine failed
  // request. Known and accepted.

  return positions;
}

import { Contract } from '@ethersproject/contracts';
import { Position, tickToPrice, computePoolAddress } from '@uniswap/v3-sdk';
import { FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { PositionInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { POSITION_MANAGER_ABI, getUniswapV3NftManagerAddress, getUniswapV3FactoryAddress } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

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
  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  // Get wallet address if not provided
  if (!walletAddress) {
    walletAddress = await uniswap.getFirstWalletAddress();
    if (!walletAddress) {
      throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
    }
    logger.info(`Using first available wallet address: ${walletAddress}`);
  }

  // Get position manager address
  const positionManagerAddress = getUniswapV3NftManagerAddress(network);

  // Create position manager contract with both enumerable and position ABIs
  const positionManager = new Contract(
    positionManagerAddress,
    [...ENUMERABLE_ABI, ...POSITION_MANAGER_ABI],
    ethereum.provider,
  );

  // Get number of positions owned by the wallet
  const balanceOf = await positionManager.balanceOf(walletAddress);
  const numPositions = balanceOf.toNumber();

  if (numPositions === 0) {
    return [];
  }

  // Get all position token IDs and convert to PositionInfo format
  const positions = [];
  for (let i = 0; i < numPositions; i++) {
    try {
      const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);

      // Get position details
      const positionDetails = await positionManager.positions(tokenId);

      // Zero-liquidity positions are reported, not skipped. The NFT is still
      // owned and still counted by balanceOf, it can hold uncollected
      // tokensOwed after a decrease, and it can be increased again or burned.
      // Callers that want only active liquidity filter on it themselves.

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
        throw new Error(`pool not found for ${token0.symbol}-${token1.symbol} at fee tier ${fee}`);
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

      positions.push({
        address: tokenId.toString(),
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

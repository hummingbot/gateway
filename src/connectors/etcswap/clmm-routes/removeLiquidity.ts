import { Contract } from '@ethersproject/contracts';
import { CurrencyAmount, Percent } from '@uniswap/sdk-core';
import { Position, NonfungiblePositionManager } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  RemoveLiquidityRequestType,
  RemoveLiquidityRequest,
  RemoveLiquidityResponseType,
  RemoveLiquidityResponse,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { ETCswap } from '../etcswap';
import { POSITION_MANAGER_ABI, getETCswapV3NftManagerAddress } from '../etcswap.contracts';
import { formatTokenAmount, toUniswapPool } from '../etcswap.utils';

// Default gas limit for CLMM remove liquidity operations
const CLMM_REMOVE_LIQUIDITY_GAS_LIMIT = 500000;

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
): Promise<RemoveLiquidityResponseType> {
  // Validate essential parameters
  if (!positionAddress || percentageToRemove === undefined) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  if (percentageToRemove < 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('Percentage to remove must be between 0 and 100');
  }

  // Get ETCswap and Ethereum instances
  const etcswap = await ETCswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  // Check if V3 is available
  if (!etcswap.hasV3()) {
    throw httpErrors.badRequest(`V3 CLMM is not available on network: ${network}`);
  }

  // Get the wallet
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  // Get position manager address
  const positionManagerAddress = getETCswapV3NftManagerAddress(network);

  // Check NFT ownership
  try {
    await etcswap.checkNFTOwnership(positionAddress, walletAddress);
  } catch (error: any) {
    if (error.message.includes('is not owned by')) {
      throw httpErrors.forbidden(error.message);
    }
    throw httpErrors.badRequest(error.message);
  }

  // Create position manager contract for reading position data
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

  // Get position details
  const position = await positionManager.positions(positionAddress);

  // Get tokens by address
  const token0 = await etcswap.getToken(position.token0);
  const token1 = await etcswap.getToken(position.token1);

  if (!token0 || !token1) {
    throw httpErrors.badRequest('Token information not found for position');
  }

  // Determine base and quote tokens - WETC or lower address is base
  const isBaseToken0 =
    token0.symbol === 'WETC' ||
    (token1.symbol !== 'WETC' && token0.address.toLowerCase() < token1.address.toLowerCase());

  // Get current liquidity
  const currentLiquidity = position.liquidity;

  // Calculate liquidity to remove based on percentage
  const liquidityToRemove = currentLiquidity.mul(Math.floor(percentageToRemove * 100)).div(10000);

  // Get the pool (ETCswap Pool)
  const etcswapPool = await etcswap.getV3Pool(token0, token1, position.fee);
  if (!etcswapPool) {
    throw httpErrors.notFound('Pool not found for position');
  }

  // Convert to Uniswap Pool for position management
  const pool = toUniswapPool(etcswapPool);

  // Create a Position instance to calculate expected amounts
  const positionSDK = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: currentLiquidity.toString(),
  });

  // Calculate the amounts that will be withdrawn
  const liquidityPercentage = new Percent(Math.floor(percentageToRemove * 100), 10000);
  const partialPosition = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: JSBI.divide(
      JSBI.multiply(JSBI.BigInt(currentLiquidity.toString()), JSBI.BigInt(liquidityPercentage.numerator.toString())),
      JSBI.BigInt(liquidityPercentage.denominator.toString()),
    ),
  });

  // Get the expected amounts
  const amount0 = partialPosition.amount0;
  const amount1 = partialPosition.amount1;

  // Apply slippage tolerance
  const slippageTolerance = new Percent(100, 10000); // 1% slippage
  const amount0Min = amount0.multiply(new Percent(1).subtract(slippageTolerance)).quotient;
  const amount1Min = amount1.multiply(new Percent(1).subtract(slippageTolerance)).quotient;

  // Also add any fees that have been collected to the expected amounts
  // Use pool.token0/token1 (Uniswap tokens) for CurrencyAmount
  const totalAmount0 = CurrencyAmount.fromRawAmount(
    pool.token0,
    JSBI.add(amount0.quotient, JSBI.BigInt(position.tokensOwed0.toString())),
  );
  const totalAmount1 = CurrencyAmount.fromRawAmount(
    pool.token1,
    JSBI.add(amount1.quotient, JSBI.BigInt(position.tokensOwed1.toString())),
  );

  // Create parameters for removing liquidity
  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage,
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
    burnToken: false,
    collectOptions: {
      expectedCurrencyOwed0: totalAmount0,
      expectedCurrencyOwed1: totalAmount1,
      recipient: walletAddress,
    },
  };

  // Get the calldata using the SDK
  const { calldata, value } = NonfungiblePositionManager.removeCallParameters(positionSDK, removeParams);

  // Initialize position manager with multicall interface
  const positionManagerWithSigner = new Contract(
    positionManagerAddress,
    [
      {
        inputs: [{ internalType: 'bytes[]', name: 'data', type: 'bytes[]' }],
        name: 'multicall',
        outputs: [{ internalType: 'bytes[]', name: 'results', type: 'bytes[]' }],
        stateMutability: 'payable',
        type: 'function',
      },
    ],
    wallet,
  );

  // Execute the transaction to remove liquidity
  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_REMOVE_LIQUIDITY_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());

  const tx = await positionManagerWithSigner.multicall([calldata], txParams);

  // Wait for transaction confirmation
  const receipt = await ethereum.handleTransactionExecution(tx);

  // Calculate gas fee
  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);

  // Calculate token amounts removed including fees
  const token0AmountRemoved = formatTokenAmount(totalAmount0.quotient.toString(), token0.decimals);
  const token1AmountRemoved = formatTokenAmount(totalAmount1.quotient.toString(), token1.decimals);

  // Map back to base and quote amounts
  const baseTokenAmountRemoved = isBaseToken0 ? token0AmountRemoved : token1AmountRemoved;
  const quoteTokenAmountRemoved = isBaseToken0 ? token1AmountRemoved : token0AmountRemoved;

  return {
    signature: receipt.transactionHash,
    status: receipt.status,
    data: {
      fee: gasFee,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
    },
  };
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from an ETCswap V3 position',
        tags: ['/connector/etcswap'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'classic' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
              examples: ['1234'],
            },
            percentageToRemove: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              examples: [50],
            },
          },
        },
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress: requestedWalletAddress, positionAddress, percentageToRemove } = request.body;

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          const etcswap = await ETCswap.getInstance(network);
          walletAddress = await etcswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
        }

        return await removeLiquidity(network, walletAddress, positionAddress, percentageToRemove);
      } catch (e: any) {
        logger.error('Failed to remove liquidity:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

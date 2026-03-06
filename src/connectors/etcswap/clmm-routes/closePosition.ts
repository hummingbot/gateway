import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@uniswap/sdk-core';
import { Position, NonfungiblePositionManager } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ClosePositionRequestType,
  ClosePositionRequest,
  ClosePositionResponseType,
  ClosePositionResponse,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { ETCswap } from '../etcswap';
import { POSITION_MANAGER_ABI, getETCswapV3NftManagerAddress } from '../etcswap.contracts';
import { formatTokenAmount, toUniswapPool } from '../etcswap.utils';

// Default gas limit for CLMM close position operations
const CLMM_CLOSE_POSITION_GAS_LIMIT = 400000;

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  // Validate essential parameters
  if (!positionAddress) {
    throw httpErrors.badRequest('Missing required parameters');
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

  // Create position manager contract
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

  // Check if position has already been closed
  if (currentLiquidity.isZero() && position.tokensOwed0.isZero() && position.tokensOwed1.isZero()) {
    throw httpErrors.badRequest('Position has already been closed or has no liquidity/fees to collect');
  }

  // Get fees owned
  const feeAmount0 = position.tokensOwed0;
  const feeAmount1 = position.tokensOwed1;

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

  // Get the expected amounts for 100% removal
  const amount0 = positionSDK.amount0;
  const amount1 = positionSDK.amount1;

  // Apply slippage tolerance
  const slippageTolerance = new Percent(100, 10000); // 1% slippage
  const amount0Min = amount0.multiply(new Percent(1).subtract(slippageTolerance)).quotient;
  const amount1Min = amount1.multiply(new Percent(1).subtract(slippageTolerance)).quotient;

  // Add any fees that have been collected to the expected amounts
  // Use pool.token0/token1 (Uniswap tokens) for CurrencyAmount
  const totalAmount0 = CurrencyAmount.fromRawAmount(
    pool.token0,
    JSBI.add(amount0.quotient, JSBI.BigInt(feeAmount0.toString())),
  );
  const totalAmount1 = CurrencyAmount.fromRawAmount(
    pool.token1,
    JSBI.add(amount1.quotient, JSBI.BigInt(feeAmount1.toString())),
  );

  // Create parameters for removing all liquidity
  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage: new Percent(10000, 10000), // 100% of liquidity
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
    burnToken: true, // Burn the position token since we're closing it
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

  // Execute the transaction to remove liquidity and burn the position
  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_CLOSE_POSITION_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());

  const tx = await positionManagerWithSigner.multicall([calldata], txParams);

  // Wait for transaction confirmation
  const receipt = await ethereum.handleTransactionExecution(tx);

  // Calculate gas fee
  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);

  // Calculate token amounts removed including fees
  const token0AmountRemoved = formatTokenAmount(totalAmount0.quotient.toString(), token0.decimals);
  const token1AmountRemoved = formatTokenAmount(totalAmount1.quotient.toString(), token1.decimals);

  // Calculate fee amounts collected
  const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
  const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);

  // Map back to base and quote amounts
  const baseTokenAmountRemoved = isBaseToken0 ? token0AmountRemoved : token1AmountRemoved;
  const quoteTokenAmountRemoved = isBaseToken0 ? token1AmountRemoved : token0AmountRemoved;

  const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
  const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

  // In Ethereum Classic there's no position rent to refund, but we include it for API compatibility
  const positionRentRefunded = 0;

  return {
    signature: receipt.transactionHash,
    status: receipt.status,
    data: {
      fee: gasFee,
      positionRentRefunded,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: ClosePositionRequestType;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close an ETCswap V3 position by removing all liquidity and collecting fees',
        tags: ['/connector/etcswap'],
        body: {
          ...ClosePositionRequest,
          properties: {
            ...ClosePositionRequest.properties,
            network: { type: 'string', default: 'classic' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
              examples: ['1234'],
            },
          },
        },
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress: requestedWalletAddress, positionAddress } = request.body;

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          const etcswap = await ETCswap.getInstance(network);
          walletAddress = await etcswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
        }

        return await closePosition(network, walletAddress, positionAddress);
      } catch (e: any) {
        logger.error('Failed to close position:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to close position');
      }
    },
  );
};

export default closePositionRoute;

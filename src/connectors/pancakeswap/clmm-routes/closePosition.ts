import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@pancakeswap/sdk';
import { NonfungiblePositionManager, Position } from '@pancakeswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import { Address } from 'viem';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ClosePositionRequestType,
  ClosePositionRequest,
  ClosePositionResponseType,
  ClosePositionResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { POSITION_MANAGER_ABI, getPancakeswapV3NftManagerAddress } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Default gas limit for CLMM close position operations
const CLMM_CLOSE_POSITION_GAS_LIMIT = 400000;

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ClosePositionRequestType;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Pancakeswap V3 position by removing all liquidity and collecting fees',
        tags: ['/connector/pancakeswap'],
        body: ClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress: requestedWalletAddress, positionAddress } = request.body;

        const networkToUse = network;

        // Validate essential parameters
        if (!positionAddress) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Pancakeswap and Ethereum instances
        const pancakeswap = await Pancakeswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await pancakeswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Get position manager address
        const positionManagerAddress = getPancakeswapV3NftManagerAddress(networkToUse);

        // Check NFT ownership
        try {
          await pancakeswap.checkNFTOwnership(positionAddress, walletAddress);
        } catch (error: any) {
          if (error.message.includes('is not owned by')) {
            throw fastify.httpErrors.forbidden(error.message);
          }
          throw fastify.httpErrors.badRequest(error.message);
        }

        // Create position manager contract
        const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

        // Get position details
        const position = await positionManager.positions(positionAddress);

        // Get tokens by address
        const token0 = pancakeswap.getTokenByAddress(position.token0);
        const token1 = pancakeswap.getTokenByAddress(position.token1);

        // Determine base and quote tokens - WETH or lower address is base
        const isBaseToken0 =
          token0.symbol === 'WETH' ||
          (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

        // Get current liquidity
        const currentLiquidity = position.liquidity;

        // Check if position has already been closed
        if (currentLiquidity.isZero() && position.tokensOwed0.isZero() && position.tokensOwed1.isZero()) {
          throw fastify.httpErrors.badRequest('Position has already been closed or has no liquidity/fees to collect');
        }

        // Get fees owned
        const feeAmount0 = position.tokensOwed0;
        const feeAmount1 = position.tokensOwed1;

        // Get the pool
        const pool = await pancakeswap.getV3Pool(token0, token1, position.fee);
        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found for position');
        }

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

        // Add any fees that have been collected to the expected amounts
        const totalAmount0 = CurrencyAmount.fromRawAmount(
          token0,
          BigInt(amount0.quotient) + BigInt(feeAmount0.toString()),
        );
        const totalAmount1 = CurrencyAmount.fromRawAmount(
          token1,
          BigInt(amount1.quotient) + BigInt(feeAmount1.toString()),
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
            recipient: walletAddress as Address,
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
        // Use Ethereum's prepareGasOptions method
        const txParams = await ethereum.prepareGasOptions(undefined, CLMM_CLOSE_POSITION_GAS_LIMIT);
        txParams.value = BigNumber.from(value.toString());

        const tx = await positionManagerWithSigner.multicall([calldata], txParams);

        // Wait for transaction confirmation
        const receipt = await ethereum.handleTransactionExecution(tx);

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

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

        // In Ethereum there's no position rent to refund, but we include it for API compatibility
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
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to close position');
      }
    },
  );
};

export default closePositionRoute;

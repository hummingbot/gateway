import { Contract } from '@ethersproject/contracts';
import { Percent } from '@uniswap/sdk-core';
import { NonfungiblePositionManager } from '@uniswap/v3-sdk';
import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ClosePositionRequestType,
  ClosePositionRequest,
  ClosePositionResponseType,
  ClosePositionResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { POSITION_MANAGER_ABI, getUniswapV3NftManagerAddress } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

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
        description: 'Close a Uniswap V3 position by removing all liquidity and collecting fees',
        tags: ['/connector/uniswap'],
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
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!positionAddress) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await uniswap.getFirstWalletAddress();
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
        const positionManagerAddress = getUniswapV3NftManagerAddress(networkToUse);

        // Create position manager contract
        const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

        // Get position details
        const position = await positionManager.positions(positionAddress);

        // Get tokens by address
        const token0 = uniswap.getTokenByAddress(position.token0);
        const token1 = uniswap.getTokenByAddress(position.token1);

        // Determine base and quote tokens
        const baseTokenSymbol = token0.symbol === 'WETH' ? token0.symbol : token1.symbol;
        const isBaseToken0 = token0.symbol === baseTokenSymbol;

        // Get current liquidity
        const currentLiquidity = position.liquidity;

        // Get fees owned
        const feeAmount0 = position.tokensOwed0;
        const feeAmount1 = position.tokensOwed1;

        // Get the pool
        const pool = await uniswap.getV3Pool(token0, token1, position.fee);
        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found for position');
        }

        // Calculate expected token amounts based on liquidity to remove
        // This is a crude approximation - actual amounts will be calculated by the contract
        const sqrtRatioX96 = BigNumber.from(pool.sqrtRatioX96.toString());
        const liquidity = BigNumber.from(currentLiquidity.toString());

        // Calculate token amounts using Uniswap V3 formulas (simplified)
        const Q96 = BigNumber.from(2).pow(96);
        let amount0, amount1;

        if (position.tickLower < pool.tickCurrent && pool.tickCurrent < position.tickUpper) {
          // Position straddles current tick
          amount0 = liquidity
            .mul(Q96)
            .mul(BigNumber.from(Math.sqrt(2 ** 96)).sub(sqrtRatioX96))
            .div(sqrtRatioX96)
            .div(Q96);

          amount1 = liquidity.mul(sqrtRatioX96.sub(BigNumber.from(Math.sqrt(2 ** 96)))).div(Q96);
        } else if (pool.tickCurrent <= position.tickLower) {
          // Position is below current tick
          amount0 = liquidity.mul(BigNumber.from(2).pow(96 / 2)).div(Q96);
          amount1 = BigNumber.from(0);
        } else {
          // Position is above current tick
          amount0 = BigNumber.from(0);
          amount1 = liquidity.mul(BigNumber.from(2).pow(96 / 2)).div(Q96);
        }

        // Add in any uncollected fees
        amount0 = amount0.add(feeAmount0);
        amount1 = amount1.add(feeAmount1);

        // Create parameters for removing liquidity
        const removeParams = {
          tokenId: positionAddress,
          liquidityPercentage: new Percent(10000, 10000), // 100% of liquidity
          slippageTolerance: new Percent(100, 10000), // 1% slippage tolerance
          deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
          burnToken: true, // Burn the position token
          collectOptions: {
            expectedCurrencyOwed0: amount0,
            expectedCurrencyOwed1: amount1,
            recipient: walletAddress,
          },
        };

        // For the sake of simplicity, we'll use a different approach
        // We'd normally use NonfungiblePositionManager.removeCallParameters, but it may need custom parameters
        // Here we'll construct a basic calldata for decreaseLiquidity and collect operations

        // Simplified approach to create calldata for removing all liquidity
        const { calldata, value } = {
          calldata: JSON.stringify([
            {
              method: 'decreaseLiquidity',
              params: {
                tokenId: positionAddress,
                liquidity: currentLiquidity.toString(),
                amount0Min: amount0.toString(),
                amount1Min: amount1.toString(),
                deadline: Math.floor(Date.now() / 1000) + 60 * 20,
              },
            },
            {
              method: 'collect',
              params: {
                tokenId: positionAddress,
                recipient: walletAddress,
                amount0Max: amount0.add(feeAmount0).toString(),
                amount1Max: amount1.add(feeAmount1).toString(),
              },
            },
          ]),
          value: '0',
        };

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
        const receipt = await tx.wait();

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        // Calculate token amounts removed
        const token0AmountRemoved = formatTokenAmount(amount0.toString(), token0.decimals);
        const token1AmountRemoved = formatTokenAmount(amount1.toString(), token1.decimals);

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
          status: 1, // CONFIRMED
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

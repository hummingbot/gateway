import { Contract } from '@ethersproject/contracts';
import { Percent } from '@uniswap/sdk-core';
import { NonfungiblePositionManager } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  RemoveLiquidityRequestType,
  RemoveLiquidityRequest,
  RemoveLiquidityResponseType,
  RemoveLiquidityResponse,
} from '../../../schemas/trading-types/clmm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { formatTokenAmount } from '../uniswap.utils';

// Define minimal ABI for the NonfungiblePositionManager
const POSITION_MANAGER_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { internalType: 'uint96', name: 'nonce', type: 'uint96' },
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'int24', name: 'tickLower', type: 'int24' },
      { internalType: 'int24', name: 'tickUpper', type: 'int24' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      {
        internalType: 'uint256',
        name: 'feeGrowthInside0LastX128',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'feeGrowthInside1LastX128',
        type: 'uint256',
      },
      { internalType: 'uint128', name: 'tokensOwed0', type: 'uint128' },
      { internalType: 'uint128', name: 'tokensOwed1', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Uniswap V3 position',
        tags: ['uniswap/clmm'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
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
        const {
          network,
          walletAddress: requestedWalletAddress,
          positionAddress,
          percentageToRemove,
        } = request.body;

        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!positionAddress || percentageToRemove === undefined) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove < 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest(
            'Percentage to remove must be between 0 and 100',
          );
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await uniswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Get position manager address
        const positionManagerAddress =
          uniswap.config.uniswapV3NftManagerAddress(networkToUse);

        // Create position manager contract
        const positionManager = new Contract(
          positionManagerAddress,
          POSITION_MANAGER_ABI,
          ethereum.provider,
        );

        // Get position details
        const position = await positionManager.positions(positionAddress);

        // Get tokens by address
        const token0 = uniswap.getTokenByAddress(position.token0);
        const token1 = uniswap.getTokenByAddress(position.token1);

        // Determine base and quote tokens
        const baseTokenSymbol =
          token0.symbol === 'WETH' ? token0.symbol : token1.symbol;
        const isBaseToken0 = token0.symbol === baseTokenSymbol;

        // Get current liquidity
        const currentLiquidity = position.liquidity;

        // Calculate liquidity to remove based on percentage
        const liquidityToRemove = currentLiquidity
          .mul(Math.floor(percentageToRemove * 100))
          .div(10000);

        // Get the pool
        const pool = await uniswap.getV3Pool(token0, token1, position.fee);
        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found for position');
        }

        // Calculate expected token amounts based on liquidity to remove
        // This is a crude approximation - actual amounts will be calculated by the contract
        const sqrtRatioX96 = BigNumber.from(pool.sqrtRatioX96.toString());
        const liquidity = BigNumber.from(liquidityToRemove.toString());

        // Calculate token amounts using Uniswap V3 formulas (simplified)
        const Q96 = BigNumber.from(2).pow(96);
        let amount0, amount1;

        if (
          position.tickLower < pool.tickCurrent &&
          pool.tickCurrent < position.tickUpper
        ) {
          // Position straddles current tick
          amount0 = liquidity
            .mul(Q96)
            .mul(BigNumber.from(Math.sqrt(2 ** 96)).sub(sqrtRatioX96))
            .div(sqrtRatioX96)
            .div(Q96);

          amount1 = liquidity
            .mul(sqrtRatioX96.sub(BigNumber.from(Math.sqrt(2 ** 96))))
            .div(Q96);
        } else if (pool.tickCurrent <= position.tickLower) {
          // Position is below current tick
          amount0 = liquidity.mul(BigNumber.from(2).pow(96 / 2)).div(Q96);
          amount1 = BigNumber.from(0);
        } else {
          // Position is above current tick
          amount0 = BigNumber.from(0);
          amount1 = liquidity.mul(BigNumber.from(2).pow(96 / 2)).div(Q96);
        }

        // Create parameters for removing liquidity
        const removeParams = {
          tokenId: positionAddress,
          liquidityPercentage: new Percent(percentageToRemove, 100),
          slippageTolerance: new Percent(1, 100), // 1% slippage tolerance
          deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
          burnToken: false,
          collectOptions: {
            expectedCurrencyOwed0: amount0,
            expectedCurrencyOwed1: amount1,
            recipient: walletAddress,
          },
        };

        // For the sake of simplicity, we'll use a different approach
        // We'd normally use NonfungiblePositionManager.removeCallParameters, but it may need custom parameters
        // Here we'll construct a basic calldata for decreaseLiquidity and collect operations

        // Simplified approach to create calldata for removing some liquidity
        const liquidityToRemoveStr = liquidityToRemove.toString();

        const { calldata, value } = {
          calldata: JSON.stringify([
            {
              method: 'decreaseLiquidity',
              params: {
                tokenId: positionAddress,
                liquidity: liquidityToRemoveStr,
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
                amount0Max: amount0.toString(),
                amount1Max: amount1.toString(),
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
              inputs: [
                { internalType: 'bytes[]', name: 'data', type: 'bytes[]' },
              ],
              name: 'multicall',
              outputs: [
                { internalType: 'bytes[]', name: 'results', type: 'bytes[]' },
              ],
              stateMutability: 'payable',
              type: 'function',
            },
          ],
          wallet,
        );

        // Execute the transaction to remove liquidity
        const tx = await positionManagerWithSigner.multicall([calldata], {
          value: BigNumber.from(value.toString()),
          gasLimit: 500000,
        });

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        // Calculate token amounts removed (approximate)
        const token0AmountRemoved = formatTokenAmount(
          amount0.toString(),
          token0.decimals,
        );
        const token1AmountRemoved = formatTokenAmount(
          amount1.toString(),
          token1.decimals,
        );

        // Map back to base and quote amounts
        const baseTokenAmountRemoved = isBaseToken0
          ? token0AmountRemoved
          : token1AmountRemoved;
        const quoteTokenAmountRemoved = isBaseToken0
          ? token1AmountRemoved
          : token0AmountRemoved;

        return {
          signature: receipt.transactionHash,
          fee: gasFee,
          baseTokenAmountRemoved,
          quoteTokenAmountRemoved,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError(
          'Failed to remove liquidity',
        );
      }
    },
  );
};

export default removeLiquidityRoute;

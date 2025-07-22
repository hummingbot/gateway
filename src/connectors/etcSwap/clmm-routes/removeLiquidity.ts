import { Percent, CurrencyAmount } from '@_etcswap/sdk-core';
import { NonfungiblePositionManager, Position } from '@_etcswap/v3-sdk';
import { Contract } from '@ethersproject/contracts';
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
import { logger } from '../../../services/logger';
import { ETCSwap } from '../etcSwap';
import { POSITION_MANAGER_ABI, getETCSwapV3NftManagerAddress } from '../etcSwap.contracts';
import { formatTokenAmount } from '../etcSwap.utils';

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
        description: 'Remove liquidity from a ETCSwap V3 position',
        tags: ['/connector/etcSwap'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
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
        const {
          network,
          walletAddress: requestedWalletAddress,
          positionAddress,
          percentageToRemove,
          priorityFeePerCU,
          computeUnits,
        } = request.body;

        const networkToUse = network;

        // Validate essential parameters
        if (!positionAddress || percentageToRemove === undefined) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove < 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest('Percentage to remove must be between 0 and 100');
        }

        // Get ETCSwap and Ethereum instances
        const etcSwap = await ETCSwap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await etcSwap.getFirstWalletAddress();
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
        const positionManagerAddress = getETCSwapV3NftManagerAddress(networkToUse);

        // Check NFT ownership
        try {
          await etcSwap.checkNFTOwnership(positionAddress, walletAddress);
        } catch (error: any) {
          if (error.message.includes('is not owned by')) {
            throw fastify.httpErrors.forbidden(error.message);
          }
          throw fastify.httpErrors.badRequest(error.message);
        }

        // Create position manager contract
        const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

        // Create position manager with signer
        const positionManagerWithSigner = positionManager.connect(wallet);

        // Get position details
        const position = await positionManager.positions(positionAddress);

        // Get tokens by address
        const token0 = etcSwap.getTokenByAddress(position.token0);
        const token1 = etcSwap.getTokenByAddress(position.token1);

        // Determine base and quote tokens - WETC or lower address is base
        const isBaseToken0 =
          token0.symbol === 'WETC' ||
          (token1.symbol !== 'WETC' && token0.address.toLowerCase() < token1.address.toLowerCase());

        // Get current liquidity
        const currentLiquidity = position.liquidity;

        // Calculate liquidity to remove based on percentage

        // Get the pool
        const pool = await etcSwap.getV3Pool(token0, token1, position.fee);
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

        // Calculate the amounts that will be withdrawn
        const liquidityPercentage = new Percent(Math.floor(percentageToRemove * 100), 10000);
        const partialPosition = new Position({
          pool,
          tickLower: position.tickLower,
          tickUpper: position.tickUpper,
          liquidity: JSBI.divide(
            JSBI.multiply(
              JSBI.BigInt(currentLiquidity.toString()),
              JSBI.BigInt(liquidityPercentage.numerator.toString()),
            ),
            JSBI.BigInt(liquidityPercentage.denominator.toString()),
          ),
        });

        // Get the expected amounts
        const amount0 = partialPosition.amount0;
        const amount1 = partialPosition.amount1;

        // Apply slippage tolerance
        const slippageTolerance = new Percent(100, 10000); // 1% slippage

        // Also add any fees that have been collected to the expected amounts
        const totalAmount0 = CurrencyAmount.fromRawAmount(
          token0,
          JSBI.add(amount0.quotient, JSBI.BigInt(position.tokensOwed0.toString())),
        );
        const totalAmount1 = CurrencyAmount.fromRawAmount(
          token1,
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

        // Execute the transaction to remove liquidity
        // Use Ethereum's prepareGasOptions method
        const txParams = await ethereum.prepareGasOptions(priorityFeePerCU, computeUnits);
        txParams.value = BigNumber.from(value.toString());

        const tx = await positionManagerWithSigner.multicall([calldata], txParams);

        return {
          signature: tx.hash,
          status: 0, // UNCONFIRMED
          data: undefined,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

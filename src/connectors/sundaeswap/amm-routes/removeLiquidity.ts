import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Cardano } from '../../../chains/cardano/cardano';
import {
  RemoveLiquidityRequestType,
  RemoveLiquidityRequest,
  RemoveLiquidityResponseType,
  RemoveLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';

import { formatTokenAmount } from '../sundaeswap.utils';
import { AssetAmount } from '@sundaeswap/asset';
import {
  EDatumType,
  IWithdrawConfigArgs,
  TSupportedNetworks,
} from '@aiquant/sundaeswap-core';
import {
  DatumBuilderLucidV3,
  TxBuilderLucidV3,
} from '@aiquant/sundaeswap-core/lucid';

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Sundaeswap pool',
        tags: ['sundaeswap/amm'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            walletAddress: { type: 'string', examples: [''] },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['SUNDAE'] },
            percentageToRemove: { type: 'number', examples: [100] },
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
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          percentageToRemove,
          walletAddress: requestedWalletAddress,
        } = request.body;

        const networkToUse = network || 'mainnet';

        // Validate essential parameters
        if (!baseToken || !quoteToken || !percentageToRemove) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove <= 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest(
            'Percentage to remove must be between 0 and 100',
          );
        }

        // Get Uniswap and Ethereum instances
        const sundaeswap = await Sundaeswap.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await sundaeswap.cardano.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        const baseTokenObj = sundaeswap.cardano.getTokenBySymbol(baseToken);
        const quoteTokenObj = sundaeswap.cardano.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(
            `Token not found: ${!baseTokenObj ? baseToken : quoteToken}`,
          );
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await sundaeswap.findDefaultPool(
            baseToken,
            quoteToken,
            'amm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        const poolData = await sundaeswap.getPoolData(poolAddress);
        const utxos =
          await sundaeswap.cardano.lucidInstance.utxosAt(walletAddress);

        // 8) Calculate withdrawal amounts
        const totalLpInWallet = sundaeswap.calculateAssetAmount(
          utxos,
          poolData.assetLP,
        );
        console.log('totalLpInWallet', totalLpInWallet);
        // Calculate how much LP token will be withdrawn based on the percentage
        const withdrawalAmount = BigInt(
          (BigInt(totalLpInWallet) * BigInt(percentageToRemove)) / BigInt(100),
        );
        // console.log('withdrawalAmount', withdrawalAmount);

        // Define the LP Token to withdraw
        const lpTokenAmount = new AssetAmount(
          withdrawalAmount,
          poolData.assetLP,
        ); // Specify LP token amount
        // console.log(lpTokenAmount);

        // Build withdraw arguments (Added `pool` property)
        const withdrawArgs: IWithdrawConfigArgs = {
          suppliedLPAsset: lpTokenAmount,
          pool: poolData,
          orderAddresses: {
            DestinationAddress: {
              address: walletAddress,
              datum: {
                type: EDatumType.NONE,
              },
            },
          },
        };

        // Initialize transaction builder
        const txBuilder = new TxBuilderLucidV3(
          sundaeswap.cardano.lucidInstance,
          new DatumBuilderLucidV3(network as TSupportedNetworks),
        );

        // Execute withdrawal transaction
        const result = await txBuilder.withdraw({ ...withdrawArgs });

        // Build the transaction
        const builtTx = await result.build();
        // Sign and submit the transaction
        const { submit, cbor } = await builtTx.sign();
        const txHash = await submit();

        // Calculate the proportional amounts that will be received
        const totalLpSupply = poolData.liquidity.lpTotal; // Total LP token supply
        const lpTokensToWithdraw = withdrawalAmount; // Amount of LP tokens being withdrawn

        // Calculate the proportion of the pool being withdrawn
        const withdrawalProportion =
          Number(lpTokensToWithdraw) / Number(totalLpSupply);

        // Get current pool reserves
        const baseTokenReserve = poolData.liquidity.aReserve; // Base token reserve in the pool
        const quoteTokenReserve = poolData.liquidity.bReserve; // Quote token reserve in the pool

        // Calculate the amounts that will be received (proportional to LP tokens withdrawn)
        const baseTokenAmountRemoved = Math.floor(
          Number(baseTokenReserve) * withdrawalProportion,
        );

        const quoteTokenAmountRemoved = Math.floor(
          Number(quoteTokenReserve) * withdrawalProportion,
        );

        return {
          signature: txHash,
          fee: builtTx.builtTx.fee,
          baseTokenAmountRemoved: baseTokenAmountRemoved,
          quoteTokenAmountRemoved: quoteTokenAmountRemoved,
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

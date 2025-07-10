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
import { Minswap } from '../minswap';

import { formatTokenAmount } from '../minswap.utils';
import { Asset, calculateWithdraw, Dex } from '@aiquant/minswap-sdk';

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Minswap pool',
        tags: ['minswap/amm'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'preprod' },
            walletAddress: { type: 'string', examples: ['addr...'] },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
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

        const networkToUse = network || 'preprod';

        // Validate essential parameters
        if (!baseToken || !quoteToken || !percentageToRemove) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove <= 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest(
            'Percentage to remove must be between 0 and 100',
          );
        }

        // Get Minswap and Cardano instances
        const minswap = await Minswap.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await minswap.cardano.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        const baseTokenObj = minswap.cardano.getTokenBySymbol(baseToken);
        const quoteTokenObj = minswap.cardano.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(
            `Token not found: ${!baseTokenObj ? baseToken : quoteToken}`,
          );
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await minswap.findDefaultPool(
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
        // 5) Fetch on-chain pool state for withdraw calculation
        const assetA: Asset = {
          policyId: baseTokenObj.policyId,
          tokenName: baseTokenObj.assetName,
        };
        const assetB: Asset = {
          policyId: quoteTokenObj.policyId,
          tokenName: quoteTokenObj.assetName,
        };
        const { poolState, poolDatum } = await minswap.getPoolData(poolAddress);

        // 6) Fetch wallet UTxOs (this also selects the key in Lucid)
        const wallet =
          await minswap.cardano.getWalletFromAddress(walletAddress);
        minswap.cardano.lucidInstance.selectWalletFromPrivateKey(wallet);
        const utxos =
          await minswap.cardano.lucidInstance.utxosAt(walletAddress);

        // 8) Calculate withdrawal amounts
        const totalLpInWallet = minswap.calculateAssetAmount(
          utxos,
          poolState.assetLP,
        );

        const withdrawLpAmount =
          (totalLpInWallet * BigInt(percentageToRemove)) / 100n;

        // 9) Calculate the assets to be received upon withdrawal
        const { amountAReceive, amountBReceive } = calculateWithdraw({
          withdrawalLPAmount: withdrawLpAmount,
          reserveA: poolState.reserveA,
          reserveB: poolState.reserveB,
          totalLiquidity: poolDatum.totalLiquidity,
        });

        const lpAsset = Asset.fromString(poolState.assetLP);
        // minimums = 0 here; you could tighten via slippage
        const dex = new Dex(minswap.cardano.lucidInstance);
        const txBuild = await dex.buildWithdrawTx({
          sender: walletAddress,
          lpAsset: lpAsset,
          lpAmount: withdrawLpAmount,
          minimumAssetAReceived: amountAReceive,
          minimumAssetBReceived: amountBReceive,
          availableUtxos: utxos,
        });

        // 9) Sign & submit
        const signed = await txBuild.sign().complete();
        const txHash = await signed.submit();
        const fee = txBuild.fee;

        // 10) Compute how many tokens were removed (roughly)
        const baseTokenAmountRemoved = formatTokenAmount(
          amountAReceive,
          baseTokenObj.decimals,
        );
        const quoteTokenAmountRemoved = formatTokenAmount(
          amountBReceive,
          quoteTokenObj.decimals,
        );

        return {
          signature: txHash,
          fee,
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

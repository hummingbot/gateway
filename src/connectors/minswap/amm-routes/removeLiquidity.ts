import { Asset, calculateWithdraw, Dex } from '@aiquant/minswap-sdk';
import { FastifyPluginAsync } from 'fastify';

import {
  RemoveLiquidityRequestType,
  RemoveLiquidityRequest,
  RemoveLiquidityResponseType,
  RemoveLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap';
import { formatTokenAmount } from '../minswap.utils';

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Minswap pool',
        tags: ['/connector/minswap/amm'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'preprod' },
            walletAddress: { type: 'string', examples: ['addr...'] },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
            percentageToRemove: { type: 'number', examples: [100] },
          },
        },
        response: { 200: RemoveLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress: requestedPoolAddress,
          percentageToRemove,
          walletAddress: requestedWalletAddress,
        } = request.body;

        const networkToUse = network || 'preprod';

        if (percentageToRemove <= 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest('Percentage to remove must be between 0 and 100');
        }

        const minswap = await Minswap.getInstance(networkToUse);

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await minswap.cardano.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        if (!requestedPoolAddress) {
          throw fastify.httpErrors.badRequest('poolAddress must be provided');
        }

        const poolInfo = await minswap.getAmmPoolInfo(requestedPoolAddress);

        const baseTokenAddress = poolInfo.baseTokenAddress;
        const quoteTokenAddress = poolInfo.quoteTokenAddress;

        const baseToken = await minswap.cardano.getTokenByAddress(baseTokenAddress);
        const quoteToken = await minswap.cardano.getTokenByAddress(quoteTokenAddress);

        if (!baseToken || !quoteToken) {
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseToken ? 'base' : 'quote'}`);
        }

        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await minswap.findDefaultPool(baseToken.symbol, quoteToken.symbol, 'amm');
          if (!poolAddress) {
            throw fastify.httpErrors.notFound(`No AMM pool found for pair ${baseToken.symbol}-${quoteToken.symbol}`);
          }
        }

        // Fetch on-chain pool state
        const { poolState, poolDatum } = await minswap.getPoolData(poolAddress);

        // Setup wallet
        const wallet = await minswap.cardano.getWalletFromAddress(walletAddress);
        minswap.cardano.lucidInstance.selectWalletFromPrivateKey(wallet);
        const utxos = await minswap.cardano.lucidInstance.utxosAt(walletAddress);

        // Calculate withdrawal amounts
        const totalLpInWallet = minswap.calculateAssetAmount(utxos, poolState.assetLP);
        const withdrawLpAmount = (totalLpInWallet * BigInt(percentageToRemove)) / 100n;

        // Calculate the assets to be received upon withdrawal
        const { amountAReceive, amountBReceive } = calculateWithdraw({
          withdrawalLPAmount: withdrawLpAmount,
          reserveA: poolState.reserveA,
          reserveB: poolState.reserveB,
          totalLiquidity: poolDatum.totalLiquidity,
        });

        // Build withdrawal transaction
        const lpAsset = Asset.fromString(poolState.assetLP);
        const dex = new Dex(minswap.cardano.lucidInstance);
        const txBuild = await dex.buildWithdrawTx({
          sender: walletAddress,
          lpAsset: lpAsset,
          lpAmount: withdrawLpAmount,
          minimumAssetAReceived: amountAReceive,
          minimumAssetBReceived: amountBReceive,
          availableUtxos: utxos,
        });

        // Sign & submit
        const signed = await txBuild.sign().complete();
        const txHash = await signed.submit();
        const fee = txBuild.fee;

        // Map withdrawal amounts based on actual asset positions
        const baseTokenId = baseToken.symbol === 'ADA' ? 'lovelace' : baseToken.policyId + baseToken.assetName;
        const quoteTokenId = quoteToken.symbol === 'ADA' ? 'lovelace' : quoteToken.policyId + quoteToken.assetName;

        let baseTokenAmountRemoved: number;
        let quoteTokenAmountRemoved: number;

        if (baseTokenId === poolState.assetA) {
          // Base token is assetA, quote token is assetB
          baseTokenAmountRemoved = Number(formatTokenAmount(amountAReceive.toString(), baseToken.decimals));
          quoteTokenAmountRemoved = Number(formatTokenAmount(amountBReceive.toString(), quoteToken.decimals));
        } else if (baseTokenId === poolState.assetB) {
          // Base token is assetB, quote token is assetA
          baseTokenAmountRemoved = Number(formatTokenAmount(amountBReceive.toString(), baseToken.decimals));
          quoteTokenAmountRemoved = Number(formatTokenAmount(amountAReceive.toString(), quoteToken.decimals));
        } else {
          throw new Error(`Base token ${baseToken.symbol} not found in pool`);
        }

        return {
          signature: txHash,
          status: 1,
          data: {
            fee,
            baseTokenAmountRemoved,
            quoteTokenAmountRemoved,
          },
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

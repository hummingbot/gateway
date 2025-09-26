import { Assets, TxComplete } from '@aiquant/lucid-cardano';
import { EDatumType, IDepositConfigArgs, TSupportedNetworks } from '@aiquant/sundaeswap-core';
import { DatumBuilderLucidV3, TxBuilderLucidV3 } from '@aiquant/sundaeswap-core/lucid';
import { AssetAmount, IAssetAmountMetadata } from '@sundaeswap/asset';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { CardanoToken } from '#src/tokens/types';

import {
  AddLiquidityRequestType,
  AddLiquidityRequest,
  AddLiquidityResponseType,
  AddLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';
import { formatTokenAmount } from '../sundaeswap.utils';

import { getSundaeswapAmmLiquidityQuote } from './quoteLiquidity';

async function addLiquidity(
  fastify: any,
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: CardanoToken,
  quoteToken: CardanoToken,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
): Promise<AddLiquidityResponseType> {
  const networkToUse = network || 'mainnet';

  // 1) Get quote for optimal amounts
  const quote = await getSundaeswapAmmLiquidityQuote(
    networkToUse,
    poolAddress,
    baseToken,
    quoteToken,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  // 2) Prepare Sundaeswap
  const sundaeswap = await Sundaeswap.getInstance(networkToUse);
  const { cardano } = sundaeswap;

  // 3) Ensure wallet key
  const privateKey = await cardano.getWalletFromAddress(walletAddress);
  if (!privateKey) {
    throw fastify.httpErrors.badRequest('Wallet not found');
  }
  cardano.lucidInstance.selectWalletFromPrivateKey(privateKey);

  // Map base/quote amounts to correct assetA/assetB based on pool structure
  const baseTokenId = baseToken.symbol === 'ADA' ? 'ada.lovelace' : `${baseToken.policyId}.${baseToken.assetName}`;

  const quoteTokenId = quoteToken.symbol === 'ADA' ? 'ada.lovelace' : `${quoteToken.policyId}.${quoteToken.assetName}`;

  // Get asset IDs from pool data
  const assetAId = quote.poolData.assetA.assetId.trim();
  const assetBId = quote.poolData.assetB.assetId.trim();

  let assetAAmount: string;
  let assetBAmount: string;

  if (baseTokenId === assetAId) {
    // Base token is assetA, quote token is assetB
    assetAAmount = quote.rawBaseTokenAmount;
    assetBAmount = quote.rawQuoteTokenAmount;
  } else if (baseTokenId === assetBId) {
    // Base token is assetB, quote token is assetA
    assetAAmount = quote.rawQuoteTokenAmount; // Quote amount goes to assetA
    assetBAmount = quote.rawBaseTokenAmount; // Base amount goes to assetB
  } else {
    throw new Error(`Base token ${baseToken.symbol} not found in pool`);
  }

  // Create asset amounts with correct mapping
  const depositArgs: IDepositConfigArgs = {
    suppliedAssets: [
      new AssetAmount(assetAAmount, quote.poolData.assetA),
      new AssetAmount(assetBAmount, quote.poolData.assetB),
    ] as [AssetAmount<IAssetAmountMetadata>, AssetAmount<IAssetAmountMetadata>],
    pool: quote.poolData,
    orderAddresses: {
      DestinationAddress: {
        address: walletAddress,
        datum: {
          type: EDatumType.NONE,
        },
      },
    },
  };

  const txBuilder = new TxBuilderLucidV3(
    sundaeswap.cardano.lucidInstance,
    new DatumBuilderLucidV3(network as TSupportedNetworks),
  );

  const result = await txBuilder.deposit({ ...depositArgs });
  const builtTx = await result.build();
  const { submit } = await builtTx.sign();
  const txHash = await submit();

  return {
    signature: txHash,
    status: 1,
    data: {
      fee: builtTx.builtTx.fee,
      baseTokenAmountAdded: quote.baseTokenAmount,
      quoteTokenAmountAdded: quote.quoteTokenAmount,
    },
  };
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Sundaeswap pool',
        tags: ['/connector/sundaeswap/amm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            walletAddress: { type: 'string', examples: ['addr'] },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['SUNDAE'] },
            baseTokenAmount: { type: 'number', examples: [0.001] },
            quoteTokenAmount: { type: 'number', examples: [2.5] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: AddLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress: reqPool,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          walletAddress: reqWallet,
        } = request.body;

        if (!baseTokenAmount || !quoteTokenAmount) {
          throw fastify.httpErrors.badRequest('Missing parameters');
        }

        const sundaeswap = await Sundaeswap.getInstance(network || 'mainnet');
        const walletAddr = reqWallet || (await sundaeswap.cardano.getFirstWalletAddress());
        if (!walletAddr) {
          throw fastify.httpErrors.badRequest('No wallet address');
        }

        if (!reqPool) {
          throw fastify.httpErrors.badRequest('poolAddress must be provided');
        }

        const poolInfo = await sundaeswap.getAmmPoolInfo(reqPool);

        const baseTokenAddress = poolInfo.baseTokenAddress;
        const quoteTokenAddress = poolInfo.quoteTokenAddress;

        const baseToken = await sundaeswap.cardano.getTokenByAddress(baseTokenAddress);
        const quoteToken = await sundaeswap.cardano.getTokenByAddress(quoteTokenAddress);

        return await addLiquidity(
          fastify,
          network || 'mainnet',
          walletAddr,
          reqPool,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct !== undefined ? slippagePct / 100 : undefined,
        );
      } catch (e: any) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

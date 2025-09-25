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
  slippagePct?: number, // decimal, e.g. 0.01 for 1%
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

  const depositArgs: IDepositConfigArgs = {
    suppliedAssets: [
      new AssetAmount(quote.rawBaseTokenAmount, quote.poolData.assetA),
      new AssetAmount(quote.rawQuoteTokenAmount, quote.poolData.assetB),
    ] as [AssetAmount<IAssetAmountMetadata>, AssetAmount<IAssetAmountMetadata>], // Explicit tuple
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
    status: 1, // 1 = CONFIRMED, 0 = PENDING, -1 = FAILED
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

        // Check if poolAddress is provided
        if (!reqPool) {
          throw fastify.httpErrors.badRequest('poolAddress must be provided');
        }

        const poolInfo = await sundaeswap.getAmmPoolInfo(reqPool);

        const baseTokenAddress = poolInfo.baseTokenAddress;
        const quoteTokenAddress = poolInfo.quoteTokenAddress;
        // Find token symbol from token address
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
          slippagePct !== undefined ? slippagePct / 100 : undefined, // convert % to decimal
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

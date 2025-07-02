import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import {
  AddLiquidityRequestType,
  AddLiquidityRequest,
  AddLiquidityResponseType,
  AddLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap';
import { formatTokenAmount } from '../minswap.utils';
import { getMinswapAmmLiquidityQuote } from './quoteLiquidity';
import { Assets, TxComplete } from '@aiquant/lucid-cardano';
import { Asset, calculateDeposit, Dex } from '@aiquant/minswap-sdk';

async function addLiquidity(
  fastify: any,
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number, // decimal, e.g. 0.01 for 1%
): Promise<AddLiquidityResponseType> {
  const networkToUse = network || 'mainnet';

  // 1) Get quote for optimal amounts
  const quote = await getMinswapAmmLiquidityQuote(
    networkToUse,
    poolAddress,
    baseToken,
    quoteToken,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  // 2) Prepare Minswap
  const minswap = await Minswap.getInstance(networkToUse);
  const { cardano } = minswap;

  // 3) Ensure wallet key
  const privateKey = await cardano.getWalletFromAddress(walletAddress);
  if (!privateKey) {
    throw fastify.httpErrors.badRequest('Wallet not found');
  }
  cardano.lucidInstance.selectWalletFromPrivateKey(privateKey);

  // 4) Determine slippage
  const slippage =
    slippagePct !== undefined ? slippagePct : minswap.getAllowedSlippage(); // returns decimal, e.g. 0.005

  // 5) Fetch on-chain pool state for deposit calculation
  const assetA: Asset = {
    policyId: quote.baseTokenObj.policyId,
    tokenName: quote.baseTokenObj.assetName,
  };
  const assetB: Asset = {
    policyId: quote.quoteTokenObj.policyId,
    tokenName: quote.quoteTokenObj.assetName,
  };
  const poolState = await minswap.blockfrostAdapter.getV2PoolByPair(
    assetA,
    assetB,
  );
  if (!poolState) {
    throw fastify.httpErrors.internalServerError('Pool state not found');
  }
  const { reserveA, reserveB, totalLiquidity } = poolState;

  // 6) Compute necessary amounts and LP tokens
  const baseRaw = quote.rawBaseTokenAmount.toBigInt();
  const quoteRaw = quote.rawQuoteTokenAmount.toBigInt();
  const { necessaryAmountA, necessaryAmountB, lpAmount } = calculateDeposit({
    depositedAmountA: baseRaw,
    depositedAmountB: quoteRaw,
    reserveA,
    reserveB,
    totalLiquidity,
  });

  // 7) Apply slippage to LP minimum
  const minLP =
    (lpAmount * BigInt(Math.floor((1 - slippage) * 1e6))) / BigInt(1e6);

  // 8) Build tx
  const dex = new Dex(cardano.lucidInstance);
  const utxos = await cardano.lucidInstance.utxosAt(walletAddress);

  const txBuild: TxComplete = await dex.buildDepositTx({
    assetA,
    assetB,
    amountA: necessaryAmountA,
    amountB: necessaryAmountB,
    minimumLPReceived: minLP,
    sender: walletAddress,
    availableUtxos: utxos,
  });

  // 9) Sign & submit
  const signed = await txBuild.sign().complete();
  const txHash = await signed.submit();

  return {
    signature: txHash,
    fee: txBuild.fee,
    baseTokenAmountAdded: quote.baseTokenAmount,
    quoteTokenAmountAdded: quote.quoteTokenAmount,
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
        description: 'Add liquidity to a Minswap pool',
        tags: ['minswap/amm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            walletAddress: { type: 'string', examples: ['addr...'] },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
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
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          walletAddress: reqWallet,
        } = request.body;

        if (
          !baseToken ||
          !quoteToken ||
          !baseTokenAmount ||
          !quoteTokenAmount
        ) {
          throw fastify.httpErrors.badRequest('Missing parameters');
        }

        const minswap = await Minswap.getInstance(network || 'mainnet');
        const walletAddr =
          reqWallet || (await minswap.cardano.getFirstWalletAddress());
        if (!walletAddr) {
          throw fastify.httpErrors.badRequest('No wallet address');
        }

        const poolAddr =
          reqPool ||
          (await minswap.findDefaultPool(baseToken, quoteToken, 'amm'));
        if (!poolAddr) {
          throw fastify.httpErrors.notFound(
            `Pool not found for ${baseToken}-${quoteToken}`,
          );
        }

        return await addLiquidity(
          fastify,
          network || 'mainnet',
          walletAddr,
          poolAddr,
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

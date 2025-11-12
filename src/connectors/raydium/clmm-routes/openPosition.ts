import { TxVersion, TickUtils } from '@raydium-io/raydium-sdk-v2';
import { Static } from '@sinclair/typebox';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumClmmOpenPositionRequest } from '../schemas';

import { quotePosition } from './quotePosition';

export async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

  const poolResponse = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolResponse) {
    throw _fastify.httpErrors.notFound(`Pool not found for address: ${poolAddress}`);
  }
  const [poolInfo, poolKeys] = poolResponse;
  const rpcData = await raydium.getClmmPoolfromRPC(poolAddress);
  poolInfo.price = rpcData.currentPrice;

  const baseTokenInfo = await solana.getToken(poolInfo.mintA.address);
  const quoteTokenInfo = await solana.getToken(poolInfo.mintB.address);

  const { tick: lowerTick } = TickUtils.getPriceAndTick({
    poolInfo,
    price: new Decimal(lowerPrice),
    baseIn: true,
  });
  const { tick: upperTick } = TickUtils.getPriceAndTick({
    poolInfo,
    price: new Decimal(upperPrice),
    baseIn: true,
  });

  // Validate price range
  if (lowerPrice >= upperPrice) {
    throw _fastify.httpErrors.badRequest('Lower price must be less than upper price');
  }

  const quotePositionResponse = await quotePosition(
    _fastify,
    network,
    lowerPrice,
    upperPrice,
    poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  logger.info('Opening Raydium CLMM position...');

  // Use hardcoded compute units for open position
  const COMPUTE_UNITS = 500000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  const { transaction: txn, extInfo } = await raydium.raydiumSDK.clmm.openPositionFromBase({
    poolInfo,
    poolKeys,
    tickUpper: Math.max(lowerTick, upperTick),
    tickLower: Math.min(lowerTick, upperTick),
    base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
    ownerInfo: { useSOLBalance: true },
    baseAmount: quotePositionResponse.baseLimited
      ? new BN(quotePositionResponse.baseTokenAmount * 10 ** baseTokenInfo.decimals)
      : new BN(quotePositionResponse.quoteTokenAmount * 10 ** quoteTokenInfo.decimals),
    otherAmountMax: quotePositionResponse.baseLimited
      ? new BN(quotePositionResponse.quoteTokenAmountMax * 10 ** quoteTokenInfo.decimals)
      : new BN(quotePositionResponse.baseTokenAmountMax * 10 ** baseTokenInfo.decimals),
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: COMPUTE_UNITS,
      microLamports: priorityFeePerCU,
    },
  });

  // Sign transaction using helper
  const transaction = (await raydium.signTransaction(
    txn,
    walletAddress,
    isHardwareWallet,
    wallet,
  )) as VersionedTransaction;
  await solana.simulateWithErrorHandling(transaction, _fastify);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  // Return with status
  if (confirmed && txData) {
    // Transaction confirmed, return full data
    const totalFee = txData.meta.fee;

    // Use the new helper method to extract balance changes
    const { baseTokenChange, quoteTokenChange, rent } = await solana.extractClmmBalanceChanges(
      signature,
      walletAddress,
      baseTokenInfo,
      quoteTokenInfo,
      totalFee,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        positionAddress: extInfo.nftMint.toBase58(),
        positionRent: rent,
        baseTokenAmountAdded: baseTokenChange,
        quoteTokenAmountAdded: quoteTokenChange,
      },
    };
  } else {
    // Transaction pending, return for Hummingbot to handle retry
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof RaydiumClmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;
        const networkToUse = network;

        return await openPosition(
          fastify,
          networkToUse,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default openPositionRoute;

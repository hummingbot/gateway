import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import {
  buildOpenPositionTransaction,
  priceToTick,
  roundTickToSpacing,
  parsePoolTickSpacing,
} from '../pancakeswap-sol-utils';
import { PancakeswapSolClmmOpenPositionRequest } from '../schemas';

import { quotePosition } from './quotePosition';

async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolAddress: string,
  lowerPrice: number,
  upperPrice: number,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get pool info
  const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw _fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // Get tokens
  const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound('Token information not found');
  }

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const poolPubkey = new PublicKey(poolAddress);

  // Get quote for position amounts
  const quote = await quotePosition(
    _fastify,
    network,
    lowerPrice,
    upperPrice,
    poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
  );

  // Get pool data to extract tick spacing
  const poolAccountInfo = await solana.connection.getAccountInfo(poolPubkey);
  if (!poolAccountInfo) {
    throw _fastify.httpErrors.notFound(`Pool account not found: ${poolAddress}`);
  }
  const tickSpacing = parsePoolTickSpacing(poolAccountInfo.data);

  // Calculate decimal difference for tick conversion
  const decimalDiff = baseToken.decimals - quoteToken.decimals;

  // Convert prices to ticks
  const tickLowerRaw = priceToTick(lowerPrice, decimalDiff);
  const tickUpperRaw = priceToTick(upperPrice, decimalDiff);

  // Round ticks to tick spacing
  const tickLower = roundTickToSpacing(tickLowerRaw, tickSpacing);
  const tickUpper = roundTickToSpacing(tickUpperRaw, tickSpacing);

  logger.info(`Opening position: ticks ${tickLower} to ${tickUpper} (prices ${lowerPrice} to ${upperPrice})`);

  // Convert amounts to BN with slippage
  const effectiveSlippage = slippagePct || 1.0;
  const amount0Max = new BN(
    (quote.baseTokenAmountMax * (1 + effectiveSlippage / 100) * 10 ** baseToken.decimals).toFixed(0),
  );
  const amount1Max = new BN(
    (quote.quoteTokenAmountMax * (1 + effectiveSlippage / 100) * 10 ** quoteToken.decimals).toFixed(0),
  );

  // Determine base flag
  const baseFlag = quote.baseLimited;

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction
  const { transaction, positionNftMint } = await buildOpenPositionTransaction(
    solana,
    poolPubkey,
    walletPubkey,
    tickLower,
    tickUpper,
    amount0Max,
    amount1Max,
    true, // withMetadata - create NFT with metadata
    baseFlag,
    800000,
    priorityFeePerCU,
  );

  // Sign with both wallet and NFT mint keypair
  transaction.sign([wallet, positionNftMint]);

  await solana.simulateWithErrorHandling(transaction, _fastify);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    const baseTokenChange = balanceChanges[0];
    const quoteTokenChange = balanceChanges[1];

    logger.info(`Position opened successfully. NFT Mint: ${positionNftMint.publicKey.toString()}`);
    logger.info(
      `Added ${Math.abs(baseTokenChange).toFixed(4)} ${baseToken.symbol}, ${Math.abs(quoteTokenChange).toFixed(4)} ${quoteToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        positionAddress: positionNftMint.publicKey.toString(),
        positionRent: 0, // Simplified - not extracting rent from transaction
        baseTokenAmountAdded: Math.abs(baseTokenChange),
        quoteTokenAmountAdded: Math.abs(quoteTokenChange),
      },
    };
  }

  return {
    signature,
    status: 0, // PENDING
  };
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapSolClmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new PancakeSwap Solana CLMM position with Token2022 NFT',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          walletAddress,
          poolAddress,
          lowerPrice,
          upperPrice,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        return await openPosition(
          fastify,
          network,
          walletAddress!,
          poolAddress,
          lowerPrice,
          upperPrice,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to open position');
      }
    },
  );
};

export default openPositionRoute;

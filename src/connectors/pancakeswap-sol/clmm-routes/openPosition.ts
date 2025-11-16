import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolConfig } from '../pancakeswap-sol.config';
import { priceToTick, roundTickToSpacing, parsePoolTickSpacing } from '../pancakeswap-sol.parser';
import { buildOpenPositionTransaction } from '../pancakeswap-sol.transactions';
import { PancakeswapSolClmmOpenPositionRequest } from '../schemas';

import { quotePosition } from './quotePosition';

export async function openPosition(
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
  logger.info(`=== OpenPosition Request ===`);
  logger.info(`Network: ${network}`);
  logger.info(`Wallet: ${walletAddress}`);
  logger.info(`Pool: ${poolAddress}`);
  logger.info(`Price Range: ${lowerPrice} - ${upperPrice}`);
  logger.info(`Amounts: base=${baseTokenAmount}, quote=${quoteTokenAmount}`);
  logger.info(`Slippage: ${slippagePct}%`);

  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get pool info
  const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw _fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  logger.info(`Pool Info:`);
  logger.info(`  Current Price: ${poolInfo.price}`);
  logger.info(`  Base Token: ${poolInfo.baseTokenAddress}`);
  logger.info(`  Quote Token: ${poolInfo.quoteTokenAddress}`);
  logger.info(`  Bin Step: ${poolInfo.binStep}`);
  logger.info(`  Fee: ${poolInfo.feePct}%`);

  // Get tokens
  const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound('Token information not found');
  }

  logger.info(
    `Tokens: ${baseToken.symbol}/${quoteToken.symbol} (${baseToken.decimals}/${quoteToken.decimals} decimals)`,
  );

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const poolPubkey = new PublicKey(poolAddress);

  // Get quote for position amounts with slippage
  const quote = await quotePosition(
    _fastify,
    network,
    lowerPrice,
    upperPrice,
    poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  // Get pool data to extract tick spacing
  const poolAccountInfo = await solana.connection.getAccountInfo(poolPubkey);
  if (!poolAccountInfo) {
    throw _fastify.httpErrors.notFound(`Pool account not found: ${poolAddress}`);
  }
  const tickSpacing = parsePoolTickSpacing(poolAccountInfo.data);

  // Calculate decimal difference for tick conversion
  const decimalDiff = baseToken.decimals - quoteToken.decimals;

  logger.info(`Tick Spacing: ${tickSpacing}`);
  logger.info(`Decimal Difference: ${decimalDiff}`);

  // Convert prices to ticks
  const tickLowerRaw = priceToTick(lowerPrice, decimalDiff);
  const tickUpperRaw = priceToTick(upperPrice, decimalDiff);

  logger.info(`Raw Ticks: lower=${tickLowerRaw}, upper=${tickUpperRaw}`);

  // Round ticks to tick spacing
  const tickLower = roundTickToSpacing(tickLowerRaw, tickSpacing);
  const tickUpper = roundTickToSpacing(tickUpperRaw, tickSpacing);

  logger.info(`Rounded Ticks: lower=${tickLower}, upper=${tickUpper}`);
  logger.info(
    `Quote: baseLimited=${quote.baseLimited}, base=${quote.baseTokenAmount}, quote=${quote.quoteTokenAmount}`,
  );
  logger.info(`Quote Max: base=${quote.baseTokenAmountMax}, quote=${quote.quoteTokenAmountMax}`);

  // Use max amounts from quote - slippage already applied in quotePosition
  const amount0Max = new BN((quote.baseTokenAmountMax * 10 ** baseToken.decimals).toFixed(0));
  const amount1Max = new BN((quote.quoteTokenAmountMax * 10 ** quoteToken.decimals).toFixed(0));

  logger.info(`Amounts with slippage (${slippagePct ?? PancakeswapSolConfig.config.slippagePct}%):`);
  logger.info(`  amount0Max: ${amount0Max.toString()} (${baseToken.symbol})`);
  logger.info(`  amount1Max: ${amount1Max.toString()} (${quoteToken.symbol})`);

  // Determine base flag
  const baseFlag = quote.baseLimited;
  logger.info(`Base Flag: ${baseFlag} (${baseFlag ? 'amount0' : 'amount1'} is base)`);

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
      } catch (e: any) {
        logger.error('Open position error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to open position';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default openPositionRoute;

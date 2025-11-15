import { DecimalUtil } from '@orca-so/common-sdk';
import { Static } from '@sinclair/typebox';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmOpenPositionRequest } from '../schemas';

// Using Fastify's native error handling

// Define error messages
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;
const POOL_NOT_FOUND_MESSAGE = (poolAddress: string) => `Pool not found: ${poolAddress}`;
const MISSING_AMOUNTS_MESSAGE = 'Missing amounts for position creation';
const INSUFFICIENT_BALANCE_MESSAGE = (token: string, required: string, actual: string) =>
  `Insufficient balance for ${token}. Required: ${required}, Available: ${actual}`;
const OPEN_POSITION_ERROR_MESSAGE = (error: any) => `Failed to open position: ${error.message || error}`;

const SOL_POSITION_RENT = 0.05; // SOL amount required for position rent
const SOL_TRANSACTION_BUFFER = 0.01; // Additional SOL buffer for transaction costs

export async function openPosition(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount: number | undefined,
  quoteTokenAmount: number | undefined,
  slippagePct: number = MeteoraConfig.config.slippagePct,
  strategyType?: number,
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);

  // Validate addresses first
  try {
    new PublicKey(poolAddress);
    new PublicKey(walletAddress);
  } catch (error) {
    const invalidAddress = error.message.includes(poolAddress) ? 'pool' : 'wallet';
    throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE(invalidAddress));
  }

  const wallet = await solana.getWallet(walletAddress);
  const newImbalancePosition = new Keypair();

  let dlmmPool;
  try {
    dlmmPool = await meteora.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw fastify.httpErrors.notFound(POOL_NOT_FOUND_MESSAGE(poolAddress));
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid account discriminator')) {
      throw fastify.httpErrors.notFound(POOL_NOT_FOUND_MESSAGE(poolAddress));
    }
    throw error; // Re-throw unexpected errors
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  if (!baseTokenAmount && !quoteTokenAmount) {
    throw fastify.httpErrors.badRequest(MISSING_AMOUNTS_MESSAGE);
  }

  // Note: Balance validation removed - insufficient balance will be caught during transaction execution
  // This avoids issues with the deprecated getBalance() method and aligns with PancakeSwap-Sol behavior

  // Get current pool price from active bin
  const activeBin = await dlmmPool.getActiveBin();
  const currentPrice = Number(activeBin.pricePerToken);

  // Validate price position requirements
  if (currentPrice < lowerPrice) {
    if (!baseTokenAmount || baseTokenAmount <= 0 || (quoteTokenAmount !== undefined && quoteTokenAmount !== 0)) {
      throw fastify.httpErrors.badRequest(
        OPEN_POSITION_ERROR_MESSAGE(
          `Current price ${currentPrice.toFixed(4)} is below lower price ${lowerPrice.toFixed(4)}. ` +
            `Requires positive ${tokenXSymbol} amount and zero ${tokenYSymbol} amount.`,
        ),
      );
    }
  } else if (currentPrice > upperPrice) {
    if (!quoteTokenAmount || quoteTokenAmount <= 0 || (baseTokenAmount !== undefined && baseTokenAmount !== 0)) {
      throw fastify.httpErrors.badRequest(
        OPEN_POSITION_ERROR_MESSAGE(
          `Current price ${currentPrice.toFixed(4)} is above upper price ${upperPrice.toFixed(4)}. ` +
            `Requires positive ${tokenYSymbol} amount and zero ${tokenXSymbol} amount.`,
        ),
      );
    }
  }

  const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
  const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);
  const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true);
  const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false);

  // Don't add SOL rent to the liquidity amounts - rent is separate
  const totalXAmount = new BN(DecimalUtil.toBN(new Decimal(baseTokenAmount || 0), dlmmPool.tokenX.mint.decimals));
  const totalYAmount = new BN(DecimalUtil.toBN(new Decimal(quoteTokenAmount || 0), dlmmPool.tokenY.mint.decimals));

  // Create position transaction following SDK example
  // Slippage needs to be in BPS (basis points): percentage * 100
  const slippageBps = slippagePct * 100;

  const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: newImbalancePosition.publicKey,
    user: wallet.publicKey,
    totalXAmount,
    totalYAmount,
    strategy: {
      maxBinId,
      minBinId,
      strategyType: strategyType ?? MeteoraConfig.config.strategyType,
    },
    // Only add slippage if provided and greater than 0
    ...(slippageBps ? { slippage: slippageBps } : {}),
  });

  logger.info(
    `Opening position in pool ${poolAddress} with price range ${lowerPrice.toFixed(4)} - ${upperPrice.toFixed(4)} ${tokenYSymbol}/${tokenXSymbol}`,
  );
  logger.info(
    `Token amounts: ${(baseTokenAmount || 0).toFixed(6)} ${tokenXSymbol}, ${(quoteTokenAmount || 0).toFixed(6)} ${tokenYSymbol}`,
  );
  logger.info(`Bin IDs: min=${minBinId}, max=${maxBinId}, active=${activeBin.binId}`);
  if (slippageBps) {
    logger.info(`Slippage: ${slippagePct}% (${slippageBps} BPS)`);
  }

  // Log the transaction details before sending
  logger.info(`Transaction details: ${createPositionTx.instructions.length} instructions`);

  // Set the fee payer for simulation
  createPositionTx.feePayer = wallet.publicKey;

  // Simulate with error handling (no signing needed for simulation)
  await solana.simulateWithErrorHandling(createPositionTx, fastify);

  logger.info('Transaction simulated successfully, sending to network...');

  // Send and confirm the ORIGINAL unsigned transaction
  // sendAndConfirmTransaction will handle the signing and auto-simulate for optimal compute units
  const { signature, fee: txFee } = await solana.sendAndConfirmTransaction(createPositionTx, [
    wallet,
    newImbalancePosition,
  ]);

  // Get transaction data for confirmation
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const confirmed = txData !== null;

  if (confirmed && txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, wallet.publicKey.toBase58(), [
      tokenX.address,
      tokenY.address,
    ]);

    const baseTokenBalanceChange = balanceChanges[0];
    const quoteTokenBalanceChange = balanceChanges[1];

    // Calculate sentSOL based on which token is SOL
    const sentSOL =
      tokenXSymbol === 'SOL'
        ? Math.abs(baseTokenBalanceChange - txFee)
        : tokenYSymbol === 'SOL'
          ? Math.abs(quoteTokenBalanceChange - txFee)
          : txFee;

    logger.info(
      `Position opened at ${newImbalancePosition.publicKey.toBase58()}: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${tokenXSymbol}, ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${tokenYSymbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txFee,
        positionAddress: newImbalancePosition.publicKey.toBase58(),
        positionRent: sentSOL,
        baseTokenAmountAdded: baseTokenBalanceChange,
        quoteTokenAmountAdded: quoteTokenBalanceChange,
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof MeteoraClmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmOpenPositionRequest,
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
          strategyType,
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
          strategyType,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message || 'Request failed');
        }
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default openPositionRoute;

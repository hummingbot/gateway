import { DecimalUtil } from '@orca-so/common-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';

// Using Fastify's native error handling

// Define error messages
const POOL_NOT_FOUND_MESSAGE = (poolAddress: string) => `Pool not found: ${poolAddress}`;
const MISSING_AMOUNTS_MESSAGE = 'Missing amounts for position creation';
const OPEN_POSITION_ERROR_MESSAGE = (error: any) => `Failed to open position: ${error.message || error}`;

export async function openPosition(
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
  } catch {
    throw httpErrors.badRequest(`Invalid pool address: ${poolAddress}`);
  }
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  // Build with the wallet's public key as authority — works for every wallet type
  // (local, hardware). Signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which knows how to sign for each type.
  const walletPublicKey = new PublicKey(walletAddress);
  const newImbalancePosition = new Keypair();

  let dlmmPool;
  try {
    dlmmPool = await meteora.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw httpErrors.notFound(POOL_NOT_FOUND_MESSAGE(poolAddress));
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid account discriminator')) {
      throw httpErrors.notFound(POOL_NOT_FOUND_MESSAGE(poolAddress));
    }
    // Handle InvalidPositionWidth error from Meteora SDK
    if (error instanceof Error && error.message.includes('InvalidPositionWidth')) {
      throw httpErrors.badRequest('Invalid position width. Please use a position width of 69 bins or lower.');
    }
    throw error; // Re-throw unexpected errors
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  if (!baseTokenAmount && !quoteTokenAmount) {
    throw httpErrors.badRequest(MISSING_AMOUNTS_MESSAGE);
  }

  // Note: Balance validation removed - insufficient balance will be caught during transaction execution
  // This avoids issues with the deprecated getBalance() method and aligns with PancakeSwap-Sol behavior

  // Get current pool price from active bin
  const activeBin = await dlmmPool.getActiveBin();
  const currentPrice = Number(activeBin.pricePerToken);

  // Validate price position requirements
  if (currentPrice < lowerPrice) {
    if (!baseTokenAmount || baseTokenAmount <= 0 || (quoteTokenAmount !== undefined && quoteTokenAmount !== 0)) {
      throw httpErrors.badRequest(
        OPEN_POSITION_ERROR_MESSAGE(
          `Current price ${currentPrice.toFixed(4)} is below lower price ${lowerPrice.toFixed(4)}. ` +
            `Requires positive ${tokenXSymbol} amount and zero ${tokenYSymbol} amount.`,
        ),
      );
    }
  } else if (currentPrice > upperPrice) {
    if (!quoteTokenAmount || quoteTokenAmount <= 0 || (baseTokenAmount !== undefined && baseTokenAmount !== 0)) {
      throw httpErrors.badRequest(
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

  // A DLMM position holds at most 69 bins (program error 0x1798/6040 beyond that; ranges
  // past ~130 bins fail even earlier with InvalidRealloc because the position account
  // would exceed Solana's 10,240-byte CPI allocation limit). Validate here so users get
  // the actual constraint instead of a cryptic on-chain error.
  const MAX_POSITION_BIN_WIDTH = 69;
  const positionWidth = maxBinId - minBinId + 1;
  if (positionWidth > MAX_POSITION_BIN_WIDTH) {
    const binStepPct = dlmmPool.lbPair.binStep / 100;
    const maxRangePct = ((Math.pow(1 + binStepPct / 100, MAX_POSITION_BIN_WIDTH) - 1) * 100).toFixed(1);
    throw httpErrors.badRequest(
      `Price range ${lowerPrice}-${upperPrice} spans ${positionWidth} bins, but a Meteora DLMM position holds at ` +
        `most ${MAX_POSITION_BIN_WIDTH} bins. At this pool's ${binStepPct}% bin step that is ~${maxRangePct}% ` +
        `between lower and upper price. Narrow the range, or open multiple positions to cover it.`,
    );
  }

  // Don't add SOL rent to the liquidity amounts - rent is separate
  const totalXAmount = new BN(DecimalUtil.toBN(new Decimal(baseTokenAmount || 0), dlmmPool.tokenX.mint.decimals));
  const totalYAmount = new BN(DecimalUtil.toBN(new Decimal(quoteTokenAmount || 0), dlmmPool.tokenY.mint.decimals));

  // Create position transaction following SDK example
  // Slippage needs to be in BPS (basis points): percentage * 100
  const slippageBps = slippagePct * 100;

  const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: newImbalancePosition.publicKey,
    user: walletPublicKey,
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
  createPositionTx.feePayer = walletPublicKey;

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
  // simulates internally). The newly generated position keypair is passed
  // as an extra signer.
  const { signature, fee: txFee } = await solana.sendAndConfirmTransactionForWallet(createPositionTx, walletAddress, [
    newImbalancePosition,
  ]);

  // Get transaction data for confirmation
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  const confirmed = txData !== null;

  if (confirmed && txData) {
    // Extract position rent from the position account's SOL balance
    // The position account is newly created, so its postBalance IS the rent
    const positionPubkey = newImbalancePosition.publicKey;
    const accountKeys = txData.transaction.message.getAccountKeys().staticAccountKeys;
    const postBalances = txData.meta?.postBalances || [];

    let positionRent = 0;
    const positionAccountIndex = accountKeys.findIndex((key) => key.equals(positionPubkey));
    if (positionAccountIndex !== -1) {
      // Position account's balance after tx is the rent (it was 0 before creation)
      positionRent = postBalances[positionAccountIndex] / 1e9; // Convert lamports to SOL
    }

    // Track wallet's balance changes for the tokens
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.tokenY.publicKey.toBase58(),
    ]);

    // Balance changes are negative (tokens leaving wallet)
    let baseAmountAdded = Math.abs(balanceChanges[0]);
    let quoteAmountAdded = Math.abs(balanceChanges[1]);

    // When SOL is base/quote, the wallet paid liquidity + rent on that side, so back the
    // rent out to leave the liquidity added. The transaction fee needs no correction:
    // extractBalanceChangesAndFee nets it out for the fee payer and reports it separately,
    // so subtracting it again would understate the amount by one fee.
    if (tokenXSymbol === 'SOL') {
      baseAmountAdded = baseAmountAdded - positionRent;
      if (baseAmountAdded < 0) baseAmountAdded = 0;
    } else if (tokenYSymbol === 'SOL') {
      quoteAmountAdded = quoteAmountAdded - positionRent;
      if (quoteAmountAdded < 0) quoteAmountAdded = 0;
    }

    logger.info(
      `Position opened at ${newImbalancePosition.publicKey.toBase58()}: ${baseAmountAdded.toFixed(4)} ${tokenXSymbol}, ${quoteAmountAdded.toFixed(4)} ${tokenYSymbol}, rent: ${positionRent.toFixed(6)} SOL`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txFee,
        positionAddress: newImbalancePosition.publicKey.toBase58(),
        positionRent: positionRent,
        baseTokenAmountAdded: baseAmountAdded,
        quoteTokenAmountAdded: quoteAmountAdded,
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

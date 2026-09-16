import { DecimalUtil } from '@orca-so/common-sdk';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
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
      throw httpErrors.badRequest(
        `Invalid position width. Use a width of ${Meteora.MAX_POSITION_BIN_WIDTH} bins or lower, ` +
          'or a range this route can chunk across transactions.',
      );
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

  // A range wider than one transaction can create and fund is opened by chunking the
  // deposit instead of being rejected. One position spans up to POSITION_MAX_LENGTH
  // (1400) bins, so this stays a single position; what grows is the number of
  // transactions, because the deposit is chunked at DEFAULT_BIN_PER_POSITION bins each.
  // quote-liquidity reports that count up front via `transactionCount`.
  const positionWidth = maxBinId - minBinId + 1;
  const needsChunkedOpen = positionWidth > Meteora.MAX_POSITION_BIN_WIDTH;

  // Don't add SOL rent to the liquidity amounts - rent is separate
  const totalXAmount = new BN(DecimalUtil.toBN(new Decimal(baseTokenAmount || 0), dlmmPool.tokenX.mint.decimals));
  const totalYAmount = new BN(DecimalUtil.toBN(new Decimal(quoteTokenAmount || 0), dlmmPool.tokenY.mint.decimals));

  // Create position transaction following SDK example
  // Slippage needs to be in BPS (basis points): percentage * 100
  const slippageBps = slippagePct * 100;

  const resolvedStrategyType = strategyType ?? MeteoraConfig.config.strategyType;

  logger.info(
    `Opening position in pool ${poolAddress} with price range ${lowerPrice.toFixed(4)} - ${upperPrice.toFixed(4)} ${tokenYSymbol}/${tokenXSymbol}`,
  );
  logger.info(
    `Token amounts: ${(baseTokenAmount || 0).toFixed(6)} ${tokenXSymbol}, ${(quoteTokenAmount || 0).toFixed(6)} ${tokenYSymbol}`,
  );
  logger.info(`Bin IDs: min=${minBinId}, max=${maxBinId}, active=${activeBin.binId}, width=${positionWidth}`);
  if (slippageBps) {
    logger.info(`Slippage: ${slippagePct}% (${slippageBps} BPS)`);
  }

  // The position account, and every transaction that built it. A narrow range is one
  // transaction, as before; a wide one is the same single position funded over several,
  // so everything downstream reads the list rather than a lone signature.
  let positionKeypair = newImbalancePosition;
  const signatures: string[] = [];
  let txFee = 0;

  /** Send one transaction through the wallet-type-aware chokepoint and record it. */
  const sendStep = async (tx: Transaction, signers: Keypair[], label: string): Promise<void> => {
    tx.feePayer = walletPublicKey;
    logger.info(`${label}: ${tx.instructions.length} instructions`);
    const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(tx, walletAddress, signers);
    signatures.push(signature);
    txFee += fee;
  };

  if (!needsChunkedOpen) {
    const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: newImbalancePosition.publicKey,
      user: walletPublicKey,
      totalXAmount,
      totalYAmount,
      strategy: { maxBinId, minBinId, strategyType: resolvedStrategyType },
      // Only add slippage if provided and greater than 0
      ...(slippageBps ? { slippage: slippageBps } : {}),
    });
    await sendStep(createPositionTx, [newImbalancePosition], 'Create position');
  } else {
    // The SDK sizes the work from the strategy and hands back raw instructions grouped by
    // position: the position init, idempotent ATA creations, and the deposit split into
    // chunks of DEFAULT_BIN_PER_POSITION bins. Note this takes slippage as a percentage,
    // not the basis points the single-transaction builder above wants.
    const { instructionsByPositions } = await dlmmPool.initializeMultiplePositionAndAddLiquidityByStrategy(
      async (count: number) => Array.from({ length: count }, () => Keypair.generate()),
      totalXAmount,
      totalYAmount,
      { maxBinId, minBinId, strategyType: resolvedStrategyType },
      walletPublicKey,
      walletPublicKey,
      slippagePct,
    );

    // Above POSITION_MAX_LENGTH bins the SDK splits into several positions, which this
    // route cannot describe: its response carries one position address. Refuse rather
    // than silently return one of several and leave the rest unreferenced.
    if (instructionsByPositions.length !== 1) {
      throw httpErrors.badRequest(
        `Price range ${lowerPrice}-${upperPrice} spans ${positionWidth} bins, which needs ` +
          `${instructionsByPositions.length} separate positions. This route opens one position — ` +
          `narrow the range, or open each part with its own call.`,
      );
    }

    const [plan] = instructionsByPositions;
    positionKeypair = plan.positionKeypair;

    // Create the position first, on its own. The deposit chunks are already sized to fit a
    // transaction by themselves, so folding the init and the ATA creations in alongside one
    // risks overflowing it — for the sake of saving a signature on a path that is
    // multi-transaction by nature.
    const initTx = new Transaction().add(...plan.initializeAtaIxs, plan.initializePositionIx);
    await sendStep(initTx, [plan.positionKeypair], 'Create position');

    // Each chunk deposits into part of the range. They are sent in order, and a failure
    // partway leaves the position open with the chunks so far funded — reported below
    // rather than swallowed, since the caller now owns an account it did not see created.
    for (let i = 0; i < plan.addLiquidityIxs.length; i++) {
      try {
        await sendStep(
          new Transaction().add(...plan.addLiquidityIxs[i]),
          [],
          `Add liquidity ${i + 1}/${plan.addLiquidityIxs.length}`,
        );
      } catch (error) {
        logger.error(
          `Chunk ${i + 1}/${plan.addLiquidityIxs.length} failed for ${positionKeypair.publicKey.toBase58()}`,
        );
        throw httpErrors.internalServerError(
          `Position ${positionKeypair.publicKey.toBase58()} was opened, but only ${i} of ` +
            `${plan.addLiquidityIxs.length} liquidity chunks were funded before ` +
            `${error instanceof Error ? error.message : String(error)}. The position exists and holds what ` +
            `landed — add the rest with add-liquidity, or close it to recover the funds. ` +
            `Transactions: ${signatures.join(', ')}`,
        );
      }
    }
  }

  // The transaction that created the position: the rent and the position account come from
  // this one, while the amounts added are summed across all of them below.
  const signature = signatures[0];

  // Get transaction data for confirmation
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  const confirmed = txData !== null;

  if (confirmed && txData) {
    // Extract position rent from the position account's SOL balance
    // The position account is newly created, so its postBalance IS the rent
    const positionPubkey = positionKeypair.publicKey;
    const accountKeys = txData.transaction.message.getAccountKeys().staticAccountKeys;
    const postBalances = txData.meta?.postBalances || [];

    // Read the rent off the position account itself rather than the creating transaction.
    // A chunked open grows the position as it funds each chunk, so its balance in the
    // first transaction is only the rent it started with, not what the caller paid. For a
    // single-transaction open the two are the same number.
    let positionRent = 0;
    try {
      positionRent = (await solana.connection.getBalance(positionPubkey)) / 1e9;
    } catch (error) {
      // Fall back to the creating transaction's post balance, which is right whenever the
      // position was never resized.
      logger.warn(`Could not read rent from ${positionPubkey.toBase58()}, using the creating transaction: ${error}`);
      const positionAccountIndex = accountKeys.findIndex((key) => key.equals(positionPubkey));
      if (positionAccountIndex !== -1) {
        positionRent = postBalances[positionAccountIndex] / 1e9;
      }
    }

    // Track wallet's balance changes for the tokens, across every transaction that funded
    // the position. A chunked open deposits over several, so reading only the first would
    // report a fraction of what was actually added.
    let baseAmountAdded = 0;
    let quoteAmountAdded = 0;
    for (const sig of signatures) {
      const { balanceChanges } = await solana.extractBalanceChangesAndFee(sig, walletPublicKey.toBase58(), [
        dlmmPool.tokenX.publicKey.toBase58(),
        dlmmPool.tokenY.publicKey.toBase58(),
      ]);
      // Balance changes are negative (tokens leaving wallet)
      baseAmountAdded += Math.abs(balanceChanges[0]);
      quoteAmountAdded += Math.abs(balanceChanges[1]);
    }

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
      `Position opened at ${positionKeypair.publicKey.toBase58()} over ${signatures.length} transaction(s): ` +
        `${baseAmountAdded.toFixed(4)} ${tokenXSymbol}, ${quoteAmountAdded.toFixed(4)} ${tokenYSymbol}, ` +
        `rent: ${positionRent.toFixed(6)} SOL`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txFee,
        positionAddress: positionKeypair.publicKey.toBase58(),
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

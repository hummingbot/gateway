import { StrategyType } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';

// Using Fastify's native error handling

// Define error messages
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;
const MISSING_AMOUNTS_MESSAGE = 'Missing amounts for liquidity addition';
const INSUFFICIENT_BALANCE_MESSAGE = (token: string, required: string, actual: string) =>
  `Insufficient balance for ${token}. Required: ${required}, Available: ${actual}`;

const SOL_TRANSACTION_BUFFER = 0.01; // SOL buffer for transaction costs

export async function addLiquidity(
  network: string,
  address: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
  strategyType?: StrategyType,
): Promise<AddLiquidityResponseType> {
  // Validate addresses first
  try {
    new PublicKey(positionAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid position address: ${positionAddress}`);
  }
  try {
    new PublicKey(address);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${address}`);
  }

  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  // Build with the wallet's public key as authority — works for every wallet type
  // (local, hardware). Signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which knows how to sign for each type.
  const walletPublicKey = new PublicKey(address);

  // Validate amounts
  if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
    throw httpErrors.badRequest(MISSING_AMOUNTS_MESSAGE);
  }

  // Get position - handle null return gracefully
  const positionResult = await meteora.getRawPosition(positionAddress, walletPublicKey);

  if (!positionResult || !positionResult.position) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}. Please provide a valid position address`);
  }

  const { position, info } = positionResult;

  const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
  if (!dlmmPool) {
    throw httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  // Check balances with transaction buffer
  const balances = await solana.getBalances(walletPublicKey.toBase58(), [tokenXSymbol, tokenYSymbol, 'SOL']);
  const requiredBase = baseTokenAmount + (tokenXSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);
  const requiredQuote = quoteTokenAmount + (tokenYSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);

  if (balances[tokenXSymbol] < requiredBase) {
    throw httpErrors.badRequest(
      INSUFFICIENT_BALANCE_MESSAGE(tokenXSymbol, requiredBase.toString(), balances[tokenXSymbol].toString()),
    );
  }

  if (balances[tokenYSymbol] < requiredQuote) {
    throw httpErrors.badRequest(
      INSUFFICIENT_BALANCE_MESSAGE(tokenYSymbol, requiredQuote.toString(), balances[tokenYSymbol].toString()),
    );
  }

  logger.info(
    `Adding liquidity to position ${positionAddress}: ${baseTokenAmount.toFixed(4)} ${tokenXSymbol}, ${quoteTokenAmount.toFixed(4)} ${tokenYSymbol}`,
  );
  const maxBinId = position.positionData.upperBinId;
  const minBinId = position.positionData.lowerBinId;

  const totalXAmount = new BN(DecimalUtil.toBN(new Decimal(baseTokenAmount), dlmmPool.tokenX.mint.decimals));
  const totalYAmount = new BN(DecimalUtil.toBN(new Decimal(quoteTokenAmount), dlmmPool.tokenY.mint.decimals));

  const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
    positionPubKey: new PublicKey(position.publicKey),
    user: walletPublicKey,
    totalXAmount,
    totalYAmount,
    strategy: {
      maxBinId,
      minBinId,
      strategyType: strategyType ?? MeteoraConfig.config.strategyType,
    },
    slippage: slippagePct,
  });

  // Set the fee payer for simulation
  addLiquidityTx.feePayer = walletPublicKey;

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
  // simulates internally).
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(addLiquidityTx, address);

  // Get transaction data for confirmation
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  const confirmed = txData !== null;

  if (confirmed && txData) {
    // Track wallet's balance changes for the tokens
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.tokenY.publicKey.toBase58(),
    ]);

    // Balance changes are negative (tokens leaving wallet)
    let tokenXAddedAmount = Math.abs(balanceChanges[0]);
    let tokenYAddedAmount = Math.abs(balanceChanges[1]);

    // When SOL is base/quote, wallet pays: liquidity + tx fee
    // Subtract fee to get actual liquidity added
    if (tokenXSymbol === 'SOL') {
      tokenXAddedAmount -= fee;
    } else if (tokenYSymbol === 'SOL') {
      tokenYAddedAmount -= fee;
    }

    logger.info(
      `Liquidity added to position ${positionAddress}: ${tokenXAddedAmount.toFixed(4)} ${tokenXSymbol}, ${tokenYAddedAmount.toFixed(4)} ${tokenYSymbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        baseTokenAmountAdded: tokenXAddedAmount,
        quoteTokenAmountAdded: tokenYAddedAmount,
        fee,
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

/**
 * A pump.fun creator's fees: every trade on its coins pays the creator a cut,
 * which accrues per creator — across all its coins — in two vaults: the pump
 * program's (curve trades) and PumpSwap's (trades after graduation, in WSOL).
 * One collect empties both into the creator's wallet.
 */
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { PublicKey, Transaction } from '@solana/web3.js';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pump } from '../pump';

const LAMPORTS = 1e9;

function creatorKey(value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage('Invalid creator address: {}', value));
  }
}

/** Unclaimed creator fees, in SOL, across both vaults. */
export async function getCreatorFees(
  network: string,
  creator: string,
): Promise<{ creator: string; unclaimed: number }> {
  const pump = await Pump.getInstance(network);
  const lamports = await new OnlinePumpSdk(pump.solana.connection).getCreatorVaultBalanceBothPrograms(
    creatorKey(creator),
  );
  return { creator, unclaimed: lamports.toNumber() / LAMPORTS };
}

/**
 * Collect the wallet's creator fees. Refused when there is nothing to collect,
 * rather than paying a fee to move zero.
 */
export async function claimCreatorFees(
  network: string,
  walletAddress: string,
): Promise<{ signature: string; status: number; claimed: number; fee?: number }> {
  const pump = await Pump.getInstance(network);
  const solana = pump.solana;
  const wallet = creatorKey(walletAddress);
  const online = new OnlinePumpSdk(solana.connection);
  const lamports = await online.getCreatorVaultBalanceBothPrograms(wallet);
  if (lamports.isZero()) {
    throw httpErrors.badRequest(sanitizeErrorMessage('No pump creator fees to claim for {}', walletAddress));
  }
  const transaction = new Transaction().add(...(await online.collectCoinCreatorFeeInstructions(wallet, wallet)));
  transaction.feePayer = wallet;
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await solana.getConfirmedTransactionData(signature);
  const claimed = lamports.toNumber() / LAMPORTS;
  logger.info(`Claimed ${claimed} SOL of pump creator fees for ${walletAddress}: ${signature}`);
  if (!txData) return { signature, status: 0, claimed };
  return { signature, status: 1, claimed, fee: txData.meta.fee / LAMPORTS };
}

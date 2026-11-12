/**
 * Migrate a completed pump.fun curve to its canonical PumpSwap pool.
 *
 * Pump's `migrate` is permissionless — any signer may send it once the curve
 * is complete — and on mainnet pump's own keeper sends it moments after the
 * last token sells. A chain without that keeper (a devnet or local validator) leaves the
 * token graduated with nowhere to trade until someone does; this is that call.
 */
// pump-sdk 2.0 under an alias, for migrate alone: 1.36's migrate misses the
// boost-vault accounts the live program reads (NotEnoughRemainingAccounts,
// migrate.rs:523), while 2.0 across the board would push a USDC create with a
// dev buy past the transaction size limit (create_v2 grew an account and three
// options the live program does not require).
import { PUMP_SDK as PUMP_SDK_V2, isLegacyQuoteMint } from '@pump-fun/pump-sdk-v2';
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pump } from '../pump';

/** Room for the simulation that sizes the migration (it measured ~260k). */
const MIGRATE_CU = 600_000;

export async function migrateCurve(
  network: string,
  walletAddress: string,
  baseMint: string,
): Promise<{ signature: string; status: number; poolAddress: string }> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(baseMint);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage('Invalid baseMint: {}', baseMint));
  }
  const pump = await Pump.getInstance(network);
  const state = await pump.getCurveState(mint);
  if (!state.bondingCurve.complete) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage('The pump curve of {} is not complete; only a completed curve migrates', baseMint),
    );
  }
  const poolAddress = pump.canonicalPoolAddress(mint, state.quoteMint);
  if (await pump.solana.connection.getAccountInfo(poolAddress)) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage(`Already migrated to PumpSwap pool ${poolAddress.toBase58()}: {}`, baseMint),
    );
  }
  const user = new PublicKey(walletAddress);
  const withdrawAuthority = state.global.withdrawAuthority;
  const quoteInfo = await pump.solana.connection.getAccountInfo(state.quoteMint);
  if (!quoteInfo) throw httpErrors.internalServerError(`Quote mint ${state.quoteMint.toBase58()} not found`);
  const instruction = isLegacyQuoteMint(state.bondingCurve.quoteMint)
    ? await PUMP_SDK_V2.migrateInstruction({ withdrawAuthority, mint, user, tokenProgram: state.tokenProgram })
    : await PUMP_SDK_V2.migrateV2Instruction({
        withdrawAuthority,
        mint,
        user,
        quoteMint: state.quoteMint,
        baseTokenProgram: state.tokenProgram,
        quoteTokenProgram: quoteInfo.owner,
      });
  // Migration creates the PumpSwap pool inside the call, past the 200k default the
  // sizing simulation runs under; the send re-sizes the limit from what it used.
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: MIGRATE_CU }),
    instruction,
  );
  transaction.feePayer = user;
  const { signature } = await pump.solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await pump.solana.getConfirmedTransactionData(signature);
  logger.info(`Migrated pump curve ${baseMint} to PumpSwap ${poolAddress.toBase58()}: ${signature}`);
  return { signature, status: txData ? 1 : 0, poolAddress: poolAddress.toBase58() };
}

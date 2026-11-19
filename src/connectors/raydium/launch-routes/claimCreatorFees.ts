/**
 * A Raydium LaunchLab creator's fees on one launch: the creator's fee vault for the
 * launch's quote (one vault per creator and quote, across all its launches), and, once
 * the token has graduated, the creator fee of the CPMM pools it graduated into. One
 * transaction collects both into the creator's wallet; wrapped SOL is unwrapped.
 */
import {
  AccountLayout,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import {
  claimCreatorFeeInstruction,
  collectCpmmCreatorFeeInstruction,
  cpmmPoolsCreatedBy,
  creatorFeeVaultFor,
  launchlabPoolByMint,
} from '../launchlab/launchlab';

function key(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage(`Invalid ${field}: {}`, value));
  }
}

export async function claimCreatorFees(
  network: string,
  walletAddress: string,
  baseMint: string,
): Promise<{ signature: string; status: number; claimed: number; quoteMint: string; fee?: number }> {
  const solana = await Solana.getInstance(network);
  const connection = solana.connection;
  const creator = key(walletAddress, 'walletAddress');
  const mint = key(baseMint, 'baseMint');
  const { address: launchPool, state: launch } = await launchlabPoolByMint(connection, mint);
  if (!launch.creator.equals(creator)) {
    throw httpErrors.badRequest(
      `${walletAddress} is not the creator (${launch.creator.toBase58()}) of the LaunchLab pool ${launchPool.toBase58()}`,
    );
  }
  const quoteMint = launch.mintB;
  const quoteDecimals = launch.mintDecimalsB;

  // The creator's vault for this quote. It exists once a launch of the creator's in
  // this quote has traded; empty or absent, there is nothing in it to claim.
  const vault = creatorFeeVaultFor(creator, quoteMint);
  const vaultAccount = await connection.getAccountInfo(vault);
  const vaultBalance = vaultAccount
    ? new BN(AccountLayout.decode(new Uint8Array(vaultAccount.data)).amount.toString())
    : new BN(0);

  // After graduation, the CPMM pools the token moved into pay the creator a fee too.
  const graduated = (await cpmmPoolsCreatedBy(connection, mint, creator)).filter(
    ({ state }) => !state.creatorFeesMintA.isZero() || !state.creatorFeesMintB.isZero(),
  );

  if (vaultBalance.isZero() && graduated.length === 0) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage('No Raydium LaunchLab creator fees to claim on {} for this wallet', baseMint),
    );
  }

  const transaction = new Transaction();
  const quoteAccount = getAssociatedTokenAddressSync(quoteMint, creator, true, TOKEN_PROGRAM_ID);
  let quoteRaw = new BN(0);
  if (!vaultBalance.isZero()) {
    // The claim pays into the creator's quote account, which must exist.
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(creator, quoteAccount, creator, quoteMint, TOKEN_PROGRAM_ID),
      claimCreatorFeeInstruction(creator, quoteMint),
    );
    quoteRaw = quoteRaw.add(vaultBalance);
  }
  for (const { address, state } of graduated) {
    transaction.add(collectCpmmCreatorFeeInstruction(creator, address, state));
    quoteRaw = quoteRaw.add(state.mintA.equals(quoteMint) ? state.creatorFeesMintA : state.creatorFeesMintB);
  }
  if (quoteMint.equals(NATIVE_MINT)) {
    // SOL fees arrive wrapped: unwrap them to the creator's SOL.
    transaction.add(createCloseAccountInstruction(quoteAccount, creator, creator));
  }
  transaction.feePayer = creator;

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await solana.getConfirmedTransactionData(signature);
  const claimed = new Decimal(quoteRaw.toString()).div(Decimal.pow(10, quoteDecimals)).toNumber();
  logger.info(`Claimed ${claimed} of ${quoteMint.toBase58()} in LaunchLab creator fees on ${baseMint}: ${signature}`);
  if (!txData) return { signature, status: 0, claimed, quoteMint: quoteMint.toBase58() };
  return { signature, status: 1, claimed, quoteMint: quoteMint.toBase58(), fee: txData.meta.fee / 1e9 };
}

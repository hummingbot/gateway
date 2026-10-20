/**
 * Migrate a completed Meteora DBC curve into its DAMM v2 pool.
 *
 * Migration is permissionless: once the curve's quote reserve reaches the config's
 * threshold, any payer may send it. Meteora's keeper does so for configs that ask it to;
 * a config that does not leaves the token graduated with nowhere to trade until someone
 * does. When the config locks vesting tokens, the locker is created first, in its own
 * transaction, and the migration follows it.
 */
import { DAMM_V2_MIGRATION_FEE_ADDRESS, deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';

import { BuildStep, getBuildModeContext } from '../../../chains/solana/solana-build-mode';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { MeteoraDbc } from '../meteora-dbc';

/** DBC's `migration_progress`: the curve is complete; its locker is made. */
const POST_BONDING_CURVE = 1;
const LOCKED_VESTING = 2;
/** DBC's `migration_option` for DAMM v2 (0 is DAMM v1). */
const MIGRATE_TO_DAMM_V2 = 1;

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
  const dbc = await MeteoraDbc.getInstance(network);
  const state = await dbc.getPoolByBaseMint(mint);
  const ps = state.pool.poolState;
  const config = state.config;
  if (state.isMigrated) {
    throw httpErrors.badRequest(sanitizeErrorMessage('The Meteora DBC pool of {} has migrated already', baseMint));
  }
  if (ps.migrationProgress !== POST_BONDING_CURVE && ps.migrationProgress !== LOCKED_VESTING) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage(
        `The Meteora DBC curve of {} is not complete: it holds ${ps.quoteReserve.toString()} of the ` +
          `${config.migrationQuoteThreshold.toString()} raw quote units it migrates at`,
        baseMint,
      ),
    );
  }
  if (config.migrationOption !== MIGRATE_TO_DAMM_V2) {
    throw httpErrors.badRequest(
      `The config ${state.configAddress.toBase58()} migrates to DAMM v1, which Gateway does not build; ` +
        'only a DAMM v2 migration is supported',
    );
  }
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption];
  if (!dammConfig) {
    throw httpErrors.internalServerError(`No DAMM v2 config for migration fee option ${config.migrationFeeOption}`);
  }
  const poolAddress = deriveDammV2PoolAddress(dammConfig, ps.baseMint, config.quoteMint).toBase58();

  const payer = new PublicKey(walletAddress);
  const steps: BuildStep[] = [];
  const vesting = config.lockedVestingConfig;
  const locksVesting = !vesting.amountPerPeriod.isZero() || !vesting.cliffUnlockAmount.isZero();
  if (locksVesting && ps.migrationProgress === POST_BONDING_CURVE) {
    const locker: Transaction = await dbc.client.migration.createLocker({ payer, pool: state.poolAddress });
    steps.push({ transaction: locker });
  }
  const migration = await dbc.client.migration.migrateToDammV2({ payer, pool: state.poolAddress, dammConfig });
  const signers: Keypair[] = [migration.firstPositionNftKeypair, migration.secondPositionNftKeypair];
  steps.push({ transaction: migration.transaction, signers });
  for (const step of steps) (step.transaction as Transaction).feePayer = payer;

  if (getBuildModeContext()) {
    await dbc.solana.captureSequenceForExternalSigner(steps, walletAddress);
  }

  let signature = '';
  for (const step of steps) {
    ({ signature } = await dbc.solana.sendAndConfirmTransactionForWallet(
      step.transaction,
      walletAddress,
      step.signers ?? [],
    ));
  }
  const txData = await dbc.solana.getConfirmedTransactionData(signature);
  logger.info(`Migrated Meteora DBC pool ${state.poolAddress.toBase58()} to DAMM v2 ${poolAddress}: ${signature}`);
  return { signature, status: txData ? 1 : 0, poolAddress };
}

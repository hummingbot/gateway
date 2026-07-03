/**
 * swig:allow-program — grant the delegate role access to trading venue programs.
 * One owner (Ledger) approval, no matter how many venues you add in the call.
 *
 * Usage:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey> \
 *   [GATEWAY_SWIG_RPC_URL=<rpc url>] \   # optional — defaults to the network nodeURL in conf/
 *   GATEWAY_SWIG_VENUES=orca,meteora \            # named presets, and/or:
 *   GATEWAY_SWIG_PROGRAM_IDS=<programId,...> \    # raw program ids
 *     pnpm swig:allow-program
 *
 * Venues: orca, meteora, raydium-amm, raydium-clmm. Jupiter has NO preset on purpose — an
 * aggregator routes through arbitrary programs, so a Jupiter wallet stays token-cap-only.
 */

import { PublicKey, Transaction } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig';

import { getConnectionFromEnv, loadOwnerSigner, requireSwigAccount, resolveVenuePrograms } from './lib';

function requireDelegate(): PublicKey {
  const raw = process.env.GATEWAY_SWIG_DELEGATE_ADDRESS;
  if (!raw) throw new Error('Set GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey> (printed by swig:add-delegate).');
  return new PublicKey(raw);
}

async function main(): Promise<void> {
  const programIds = resolveVenuePrograms(process.env.GATEWAY_SWIG_VENUES, process.env.GATEWAY_SWIG_PROGRAM_IDS);
  const { connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const delegatePk = requireDelegate();
  const owner = await loadOwnerSigner();
  const swigService = getSwigService();

  const instructions = await swigService.buildAddProgramLimitsInstructions(
    connection,
    accountAddress,
    owner.publicKey,
    delegatePk,
    programIds,
  );

  console.log('\nThe owner will now sign ONE transaction: allow the delegate to use:');
  programIds.forEach((id) => console.log(`  + ${id}`));
  const sig = await owner.signAndSend(connection, new Transaction().add(...instructions));
  console.log(`✓ Programs allowed (tx ${sig})`);
  console.log('\nVerify with: pnpm swig:show');
}

main().catch((error) => {
  console.error(`\nswig:allow-program failed: ${error.message}`);
  process.exit(1);
});

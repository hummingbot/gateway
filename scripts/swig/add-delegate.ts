/**
 * swig:add-delegate — add ANOTHER bounded delegate to an EXISTING Swig. Used to rotate a
 * delegate (after swig:revoke-delegate) or to run a second, independently-bounded delegate.
 * First-time setup uses swig:create instead, which creates the Swig and its first delegate
 * together.
 *
 * Mints a FRESH delegate key into the Gateway keystore and adds its role with the baseline
 * policy — token + System programs + a one-time SOL cap (default 0.1) — but no venues and no
 * spendable mints. The delegate can do nothing until you grant them with swig:allow-program
 * and swig:add-token. One owner (Ledger) approval.
 *
 * Usage:
 *   GATEWAY_PASSPHRASE=<pass> \
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA from swig:create> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *   [GATEWAY_SWIG_SOL_LIMIT=0.1] \
 *     pnpm swig:add-delegate
 */

import { Transaction } from '@solana/web3.js';

import {
  buildFreshDelegateRole,
  getConnectionFromEnv,
  loadOwnerSigner,
  requireSwigAccount,
  resolveDelegateSolLimit,
} from './lib';

async function main(): Promise<void> {
  if (process.env.GATEWAY_SWIG_DELEGATE_ADDRESS) {
    throw new Error(
      'swig:add-delegate always creates a fresh delegate — do not set GATEWAY_SWIG_DELEGATE_ADDRESS. ' +
        '(Reusing an existing wallet as the delegate defeats the blast-radius design.)',
    );
  }
  const { connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const owner = await loadOwnerSigner();
  const solLimitLamports = resolveDelegateSolLimit();

  console.log('Generating a fresh delegate keypair (encrypted into conf/wallets/solana/, never printed) ...');
  const { delegateAddress, instructions } = await buildFreshDelegateRole(
    connection,
    accountAddress,
    owner.publicKey,
    solLimitLamports,
  );
  console.log(`✓ Delegate created: ${delegateAddress}`);

  console.log('\nThe owner will now sign ONE transaction: add the delegate role with the');
  console.log('baseline policy (token + System programs + SOL cap — no venues, no spendable mints yet).');
  let sig: string;
  try {
    sig = await owner.signAndSend(connection, new Transaction().add(...instructions));
  } catch (error: any) {
    console.error(`\nAdding the role failed: ${error.message}`);
    console.error(`The delegate key ${delegateAddress} is already in the keystore but has no role.`);
    console.error(`Delete the orphaned key and re-run to mint a fresh delegate:`);
    console.error(`  rm conf/wallets/solana/${delegateAddress}.json && pnpm swig:add-delegate`);
    process.exit(1);
  }
  console.log(`✓ Delegate role added (tx ${sig})`);

  console.log('\nPersist the delegate and grant what it may do (each is one owner approval):');
  console.log(`  echo 'GATEWAY_SWIG_DELEGATE_ADDRESS=${delegateAddress}' >> conf/swig.env`);
  console.log('  GATEWAY_SWIG_VENUES=orca,meteora pnpm swig:allow-program');
  console.log('  GATEWAY_SWIG_TOKEN_LIMITS=<mint>:<amount> pnpm swig:add-token');
}

main().catch((error) => {
  console.error(`\nswig:add-delegate failed: ${error.message}`);
  process.exit(1);
});

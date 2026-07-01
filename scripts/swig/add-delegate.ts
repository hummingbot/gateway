/**
 * swig:add-delegate — Step 2: mint a FRESH delegate key into the Gateway keystore and add
 * its role to the Swig with a baseline policy: token programs only (SPL Token, Token-2022,
 * ATA). One owner (Ledger) approval.
 *
 * The baseline is default-deny in practice: the delegate cannot touch any trading venue
 * (swig:allow-program) and cannot spend any mint (swig:add-token) until you grant them.
 *
 * Usage:
 *   GATEWAY_PASSPHRASE=<pass> \
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA from swig:init> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *     pnpm swig:add-delegate
 */

import { PublicKey, Transaction } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig';

import {
  BASE_TOKEN_PROGRAMS,
  generateAndSaveDelegate,
  getConnectionFromEnv,
  loadOwnerSigner,
  requireSwigAccount,
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
  const swigService = getSwigService();

  console.log('Generating a fresh delegate keypair (encrypted into conf/wallets/solana/, never printed) ...');
  const delegateAddress = await generateAndSaveDelegate();
  console.log(`✓ Delegate created: ${delegateAddress}`);

  const instructions = await swigService.buildAddDelegateInstructions(
    connection,
    accountAddress,
    owner.publicKey,
    new PublicKey(delegateAddress),
    { allowedProgramIds: BASE_TOKEN_PROGRAMS, tokenLimits: [] },
  );

  console.log('\nThe owner will now sign ONE transaction: add the delegate role with the');
  console.log('baseline policy (token programs only — no venues, no spendable mints yet).');
  let sig: string;
  try {
    sig = await owner.signAndSend(connection, new Transaction().add(...instructions));
  } catch (error: any) {
    console.error(`\nAdding the role failed: ${error.message}`);
    console.error(`The delegate key ${delegateAddress} is already in the keystore. Either delete`);
    console.error(`conf/wallets/solana/${delegateAddress}.json and re-run, or retry the role add with`);
    console.error('scripts/swig/create-swig-wallet.ts against that delegate.');
    process.exit(1);
  }
  console.log(`✓ Delegate role added (tx ${sig})`);

  console.log('\nNext: grant what this delegate may do (each is one owner approval):');
  console.log(`  export GATEWAY_SWIG_DELEGATE_ADDRESS=${delegateAddress}`);
  console.log('  GATEWAY_SWIG_VENUES=orca,meteora pnpm swig:allow-program');
  console.log('  GATEWAY_SWIG_TOKEN_LIMITS=<mint:amount> pnpm swig:add-token');
}

main().catch((error) => {
  console.error(`\nswig:add-delegate failed: ${error.message}`);
  process.exit(1);
});

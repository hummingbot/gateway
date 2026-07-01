/**
 * swig:init — Step 1: create the Swig account with your owner key as root authority.
 * One owner (Ledger) approval. No delegate, no permissions yet — the wallet can only be
 * controlled by the owner until you run swig:add-delegate.
 *
 * Usage:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<Ledger or keystore pubkey> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *     pnpm swig:init
 *
 * Prints the Swig account (PDA), the funds-owner address, and the base58 id. Export the PDA
 * as GATEWAY_SWIG_ACCOUNT for every following step.
 */

import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

import { getSwigService } from '../../src/wallet/swig';

import { getConnectionFromEnv, loadOwnerSigner } from './lib';

async function main(): Promise<void> {
  const { network, rpcUrl, connection } = getConnectionFromEnv();
  const owner = await loadOwnerSigner();
  const swigService = getSwigService();

  console.log(`Network: ${network}`);
  console.log(`RPC:     ${rpcUrl}`);
  console.log(`Owner:   ${owner.publicKey.toBase58()}`);

  const { id, accountAddress, createInstruction } = await swigService.buildCreateInstruction({
    payer: owner.publicKey,
    ownerPublicKey: owner.publicKey,
  });

  console.log('\nThe owner will now sign ONE transaction: create the Swig account (owner = root).');
  const sig = await owner.signAndSend(connection, new Transaction().add(createInstruction));
  console.log(`✓ Created (tx ${sig})`);

  const swig = await swigService.fetchSwig(connection, accountAddress);
  const walletPk = await swigService.getWalletAddress(swig);

  console.log('\nSwig wallet created. Save these:');
  console.log(`  Swig account (PDA):   ${accountAddress.toBase58()}`);
  console.log(`  Funds owner address:  ${walletPk.toBase58()}   <- fund + trade with this`);
  console.log(`  Swig id (base58):     ${bs58.encode(id)}       <- needed for /wallet/add-swig`);
  console.log('\nNext: export GATEWAY_SWIG_ACCOUNT and add a delegate:');
  console.log(`  export GATEWAY_SWIG_ACCOUNT=${accountAddress.toBase58()}`);
  console.log('  pnpm swig:add-delegate');
}

main().catch((error) => {
  console.error(`\nswig:init failed: ${error.message}`);
  process.exit(1);
});

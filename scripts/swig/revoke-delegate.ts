/**
 * swig:revoke-delegate — REMOVE a delegate role from the Swig entirely. One owner (Ledger)
 * approval. This is the kill switch: run it if the Gateway host (and thus the delegate key)
 * may be compromised, or to rotate the delegate (revoke, then swig:add-delegate a new one).
 *
 * Usage:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey to revoke> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *     pnpm swig:revoke-delegate
 */

import { PublicKey, Transaction } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig';

import { getConnectionFromEnv, loadOwnerSigner, requireSwigAccount } from './lib';

async function main(): Promise<void> {
  const delegateRaw = process.env.GATEWAY_SWIG_DELEGATE_ADDRESS;
  if (!delegateRaw) {
    throw new Error('Set GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey to revoke>.');
  }
  const { connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const owner = await loadOwnerSigner();
  const swigService = getSwigService();

  const instructions = await swigService.buildRemoveDelegateInstructions(
    connection,
    accountAddress,
    owner.publicKey,
    new PublicKey(delegateRaw),
  );

  console.log(`\nThe owner will now sign ONE transaction: REVOKE delegate ${delegateRaw}.`);
  console.log('After this, Gateway can no longer sign for the Swig wallet with that key.');
  const sig = await owner.signAndSend(connection, new Transaction().add(...instructions));
  console.log(`✓ Delegate revoked (tx ${sig})`);
  console.log('\nAlso remove the registration in Gateway (DELETE /wallet/remove-swig) and, if the');
  console.log(`key is compromised, delete conf/wallets/solana/${delegateRaw}.json from the keystore.`);
  console.log('To rotate: pnpm swig:add-delegate, then re-grant venues and caps.');
}

main().catch((error) => {
  console.error(`\nswig:revoke-delegate failed: ${error.message}`);
  process.exit(1);
});

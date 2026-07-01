/**
 * swig:add-token — add per-mint spend caps to the delegate role. One owner (Ledger)
 * approval. Caps are one-time allowances: the delegate spends them down and they are
 * exhausted; run this again to grant more.
 *
 * Usage:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *   GATEWAY_SWIG_TOKEN_LIMITS=<mint:amount,...> \   # base units, e.g. 50 USDC = ...USDC mint...:50000000
 *     pnpm swig:add-token
 */

import { PublicKey, Transaction } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig';

import { getConnectionFromEnv, loadOwnerSigner, parseTokenLimits, requireSwigAccount } from './lib';

async function main(): Promise<void> {
  const tokenLimits = parseTokenLimits(process.env.GATEWAY_SWIG_TOKEN_LIMITS);
  if (tokenLimits.length === 0) {
    throw new Error('Set GATEWAY_SWIG_TOKEN_LIMITS=<mint:amount,...> (base units).');
  }
  tokenLimits.forEach((l) => new PublicKey(l.mint));
  const delegateRaw = process.env.GATEWAY_SWIG_DELEGATE_ADDRESS;
  if (!delegateRaw) {
    throw new Error('Set GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey> (printed by swig:add-delegate).');
  }
  const { connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const owner = await loadOwnerSigner();
  const swigService = getSwigService();

  const instructions = await swigService.buildAddTokenLimitsInstructions(
    connection,
    accountAddress,
    owner.publicKey,
    new PublicKey(delegateRaw),
    tokenLimits,
  );

  console.log('\nThe owner will now sign ONE transaction: add spend caps:');
  tokenLimits.forEach((l) => console.log(`  + ${l.mint}: up to ${l.amount} base units (one-time)`));
  const sig = await owner.signAndSend(connection, new Transaction().add(...instructions));
  console.log(`✓ Caps added (tx ${sig})`);
  console.log('\nVerify with: GATEWAY_SWIG_TOKEN_MINTS=<mint,...> pnpm swig:show');
}

main().catch((error) => {
  console.error(`\nswig:add-token failed: ${error.message}`);
  process.exit(1);
});

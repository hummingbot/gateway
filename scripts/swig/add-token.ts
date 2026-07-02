/**
 * swig:add-token — add spend caps to the delegate role. One owner (Ledger) approval.
 * Caps are one-time allowances: the delegate spends them down and they are exhausted;
 * run this again to grant more.
 *
 * Two kinds of cap, either or both per call:
 *   - per-mint token caps (GATEWAY_SWIG_TOKEN_LIMITS)
 *   - a SOL cap (GATEWAY_SWIG_SOL_LIMIT) — required for any wallet-paid lamport debit:
 *     ATA rent when a swap creates a token account, and native-SOL wraps. Without it those
 *     swaps fail with 0xbbe (PermissionDeniedMissingPermission) AFTER the swap executes.
 *
 * Usage:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *   [GATEWAY_SWIG_TOKEN_LIMITS=<mint:amount,...>] \   # base units, e.g. 50 USDC = ...USDC mint...:50000000
 *   [GATEWAY_SWIG_SOL_LIMIT=<sol>] \                  # e.g. 0.1
 *     pnpm swig:add-token
 */

import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig';

import { getConnectionFromEnv, loadOwnerSigner, parseTokenLimits, requireSwigAccount } from './lib';

async function main(): Promise<void> {
  const tokenLimits = parseTokenLimits(process.env.GATEWAY_SWIG_TOKEN_LIMITS);
  const solLimitRaw = process.env.GATEWAY_SWIG_SOL_LIMIT;
  if (tokenLimits.length === 0 && !solLimitRaw) {
    throw new Error(
      'Set GATEWAY_SWIG_TOKEN_LIMITS=<mint:amount,...> (base units) and/or GATEWAY_SWIG_SOL_LIMIT=<sol>.',
    );
  }
  tokenLimits.forEach((l) => new PublicKey(l.mint));
  let solLamports = 0n;
  if (solLimitRaw) {
    const lamports = Math.round(Number(solLimitRaw) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error(`Invalid GATEWAY_SWIG_SOL_LIMIT: ${solLimitRaw}`);
    }
    solLamports = BigInt(lamports);
  }
  const delegateRaw = process.env.GATEWAY_SWIG_DELEGATE_ADDRESS;
  if (!delegateRaw) {
    throw new Error('Set GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey> (printed by swig:add-delegate).');
  }
  const { connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const owner = await loadOwnerSigner();
  const swigService = getSwigService();
  const delegatePk = new PublicKey(delegateRaw);

  const instructions = [];
  if (tokenLimits.length > 0) {
    instructions.push(
      ...(await swigService.buildAddTokenLimitsInstructions(
        connection,
        accountAddress,
        owner.publicKey,
        delegatePk,
        tokenLimits,
      )),
    );
  }
  if (solLamports > 0n) {
    instructions.push(
      ...(await swigService.buildAddSolLimitInstructions(
        connection,
        accountAddress,
        owner.publicKey,
        delegatePk,
        solLamports,
      )),
    );
  }

  console.log('\nThe owner will now sign ONE transaction: add spend caps:');
  tokenLimits.forEach((l) => console.log(`  + ${l.mint}: up to ${l.amount} base units (one-time)`));
  if (solLamports > 0n) console.log(`  + SOL: up to ${solLimitRaw} SOL (one-time; covers ATA rent + native wraps)`);
  const sig = await owner.signAndSend(connection, new Transaction().add(...instructions));
  console.log(`✓ Caps added (tx ${sig})`);
  console.log('\nVerify with: GATEWAY_SWIG_TOKEN_MINTS=<mint,...> pnpm swig:show');
}

main().catch((error) => {
  console.error(`\nswig:add-token failed: ${error.message}`);
  process.exit(1);
});

/**
 * swig:create — Step 1: create the Swig wallet AND its bounded delegate in one command.
 *
 * This is the invariant part of every Swig deploy, so it is bundled here:
 *   1. OWNER    — if GATEWAY_SWIG_OWNER_ADDRESS is a Ledger address not yet registered, verify
 *                 it on the connected device and record it (same as POST /wallet/add-hardware).
 *                 Skipped for a keystore/raw-secret owner.
 *   2. CREATE   — create the Swig account with the owner as root authority (owner approval #1).
 *   3. DELEGATE — generate a FRESH delegate key (encrypted into the keystore, never printed) and
 *                 add its bounded role: baseline token/System programs + a one-time SOL cap
 *                 (owner approval #2). No trading venues and no token caps yet — the delegate can
 *                 do nothing until you grant them.
 *
 * What is deliberately NOT here (deploy-specific, separate scripts):
 *   - swig:allow-program  — which trading venues the delegate may use
 *   - swig:add-token      — per-mint spend caps
 *   - swig:fund           — move SOL/tokens into the delegate and wallet
 *
 * Network + RPC come from Gateway's Solana config (conf/): solana.defaultNetwork and the
 * network's nodeURL. Override per-run with GATEWAY_SWIG_NETWORK / GATEWAY_SWIG_RPC_URL.
 *
 * Usage (the passphrase via env only, never a file, so it isn't persisted by the keystore):
 *   GATEWAY_PASSPHRASE=<pass> \                 # encrypts the generated delegate key
 *   GATEWAY_SWIG_OWNER_ADDRESS=<Ledger or keystore owner pubkey> \
 *   [GATEWAY_SWIG_SOL_LIMIT=0.1] \              # one-time SOL cap; defaults to 0.1
 *     pnpm swig:create
 */

import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

import { getSwigService } from '../../src/wallet/swig';

import {
  buildFreshDelegateRole,
  ensureHardwareOwnerRegistered,
  getConnectionFromEnv,
  loadOwnerSigner,
  requirePassphrase,
  resolveDelegateSolLimit,
} from './lib';

const USAGE = `
Required environment variables:
  GATEWAY_PASSPHRASE            Gateway passphrase (encrypts the new delegate key) — env only
  GATEWAY_SWIG_OWNER_ADDRESS    Owner pubkey — your Ledger address (or a keystore wallet)
Optional (network + RPC default from Gateway's Solana config in conf/):
  GATEWAY_SWIG_NETWORK          override solana.defaultNetwork
  GATEWAY_SWIG_RPC_URL          override the network's nodeURL
  GATEWAY_SWIG_SOL_LIMIT        One-time SOL cap for wallet-paid rent/wraps (default: 0.1)

Example (Ledger owner):
  GATEWAY_PASSPHRASE=<pass> \\
  GATEWAY_SWIG_OWNER_ADDRESS=<your Ledger Solana address> \\
    pnpm swig:create
`;

function banner(step: string): void {
  console.log(`\n━━━ ${step} ${'━'.repeat(Math.max(0, 72 - step.length))}`);
}

function validateInputs(): string[] {
  const problems: string[] = [];
  try {
    requirePassphrase();
  } catch (e: any) {
    problems.push(e.message);
  }
  if (process.env.GATEWAY_SWIG_DELEGATE_ADDRESS) {
    problems.push(
      'Do not set GATEWAY_SWIG_DELEGATE_ADDRESS — this always creates a fresh delegate. ' +
        '(Reusing an existing wallet as the delegate defeats the blast-radius design and is not supported.)',
    );
  }
  if (process.env.GATEWAY_SWIG_OWNER_KEY) {
    console.log('⚠ Using a raw GATEWAY_SWIG_OWNER_KEY. A Ledger owner (address only) is safer.');
  } else if (!process.env.GATEWAY_SWIG_OWNER_ADDRESS) {
    problems.push('Set GATEWAY_SWIG_OWNER_ADDRESS to your Ledger (or keystore) owner address.');
  } else {
    try {
      new PublicKey(process.env.GATEWAY_SWIG_OWNER_ADDRESS);
    } catch {
      problems.push(
        `GATEWAY_SWIG_OWNER_ADDRESS is not a valid Solana address: ${process.env.GATEWAY_SWIG_OWNER_ADDRESS}`,
      );
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const problems = validateInputs();
  if (problems.length > 0) {
    console.error('\nCannot start — fix the following and re-run:');
    problems.forEach((p) => console.error(`  ✗ ${p}`));
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const { network, connection } = getConnectionFromEnv();
  const solLimitLamports = resolveDelegateSolLimit();
  const swigService = getSwigService();

  // Step 1 — owner. Register a fresh Ledger owner if needed; a keystore owner is a no-op.
  banner('Step 1/3 · Owner');
  const ownerAddress = process.env.GATEWAY_SWIG_OWNER_ADDRESS;
  if (ownerAddress && !process.env.GATEWAY_SWIG_OWNER_KEY) {
    try {
      const hw = await ensureHardwareOwnerRegistered(ownerAddress);
      console.log(`✓ Hardware (Ledger) owner registered at derivation path ${hw.derivationPath}`);
    } catch (error: any) {
      // A keystore owner isn't on the Ledger — fine; only fail on a real device error.
      if (/not found on the Ledger|No Ledger device found/.test(error.message)) {
        console.log(`  ${error.message}`);
        console.log('  Continuing on the assumption the owner is a keystore wallet ...');
      } else {
        throw error;
      }
    }
  }
  const owner = await loadOwnerSigner();
  console.log(`Network: ${network}`);
  console.log(`Owner:   ${owner.publicKey.toBase58()}`);

  const solBalance = await connection.getBalance(owner.publicKey);
  if (solBalance < Math.round(0.01 * LAMPORTS_PER_SOL)) {
    console.error(
      `\nOwner holds ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL — not enough for the Swig account rent + ` +
        'two transaction fees. Top it up (~0.01 SOL) and re-run. Nothing was created.',
    );
    process.exitCode = 1;
    return;
  }

  // Step 2 — create the Swig account (owner approval #1).
  banner('Step 2/3 · Create the Swig account');
  const { id, accountAddress, createInstruction } = await swigService.buildCreateInstruction({
    payer: owner.publicKey,
    ownerPublicKey: owner.publicKey,
  });
  console.log('The owner will now sign ONE transaction: create the Swig account (owner = root).');
  const createSig = await owner.signAndSend(connection, new Transaction().add(createInstruction));
  console.log(`✓ Created (tx ${createSig})`);

  // Step 3 — add the bounded delegate (owner approval #2). Minted only after the account
  // exists, so a failed create leaves no orphan key in the keystore.
  banner('Step 3/3 · Add the bounded delegate');
  console.log('Generating a fresh delegate keypair (encrypted into conf/wallets/solana/, never printed) ...');
  let delegateAddress: string;
  try {
    const role = await buildFreshDelegateRole(connection, accountAddress, owner.publicKey, solLimitLamports);
    delegateAddress = role.delegateAddress;
    console.log(`✓ Delegate created: ${delegateAddress}`);
    console.log('The owner will now sign ONE transaction: add the delegate role with the baseline');
    console.log('policy (token + System programs + SOL cap — no venues, no spendable mints yet).');
    const addSig = await owner.signAndSend(connection, new Transaction().add(...role.instructions));
    console.log(`✓ Delegate role added (tx ${addSig})`);
  } catch (error: any) {
    console.error(`\nAdding the delegate role failed: ${error.message}`);
    console.error('The Swig account was created, but has no delegate yet. Add one against it with:');
    console.error(`  GATEWAY_SWIG_ACCOUNT=${accountAddress.toBase58()} pnpm swig:add-delegate`);
    process.exitCode = 1;
    return;
  }

  const swig = await swigService.fetchSwig(connection, accountAddress);
  const walletPk = await swigService.getWalletAddress(swig);

  banner('Done — next: grant, fund, register');
  console.log('Swig wallet + bounded delegate created. Save these:');
  console.log(`  Funds owner address:  ${walletPk.toBase58()}   <- fund + trade with this`);
  console.log(`  Swig account (PDA):   ${accountAddress.toBase58()}`);
  console.log(`  Delegate (Gateway signs): ${delegateAddress}`);
  console.log(`  Swig id (base58):     ${bs58.encode(id)}       <- needed for /wallet/add-swig`);
  console.log('\nPersist these so later steps need no exports:');
  console.log(`  echo 'GATEWAY_SWIG_ACCOUNT=${accountAddress.toBase58()}' >> conf/swig.env`);
  console.log(`  echo 'GATEWAY_SWIG_DELEGATE_ADDRESS=${delegateAddress}' >> conf/swig.env`);
  console.log('\nNext (deploy-specific, one owner approval each):');
  console.log('  GATEWAY_SWIG_VENUES=orca,meteora pnpm swig:allow-program        # allow trading venues');
  console.log('  GATEWAY_SWIG_TOKEN_LIMITS=<mint>:<amount> pnpm swig:add-token   # cap spendable tokens');
  console.log('  pnpm swig:fund                                                 # move funds in');
  console.log('Then register with Gateway (see SETUP.md).');
}

main().catch((error) => {
  console.error(`\nswig:create failed: ${error.message}`);
  process.exit(1);
});

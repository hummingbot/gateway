/**
 * One-shot Swig setup: generate the delegate key, register the hardware owner, and provision
 * the Swig wallet — Steps 1–3 of scripts/swig/SETUP.md in a single command.
 *
 * Run it with:  pnpm swig:setup   (env vars below)
 *
 * What it does, in order:
 *   1. OWNER — if GATEWAY_SWIG_OWNER_ADDRESS is a Ledger address not yet registered, verify it
 *      on the connected device and record it (same as POST /wallet/add-hardware). Skipped for a
 *      keystore/raw-secret owner.
 *   2. PREFLIGHT — check the owner's SOL/token balances cover the funding plan before anything
 *      is signed or written.
 *   3. DELEGATE KEY — ALWAYS generate a fresh delegate keypair and store it ENCRYPTED in the
 *      Gateway keystore (needs GATEWAY_PASSPHRASE). The secret is never printed. Reusing an
 *      existing wallet as the delegate is a footgun, so this script won't; to provision against
 *      a pre-existing delegate, use scripts/swig/create-swig-wallet.ts instead.
 *   4. PROVISION — create the Swig, add the bounded delegate role (allowlist + per-mint caps),
 *      and optionally fund the delegate (SOL) and the Swig wallet (tokens) from the owner.
 *
 * It prints the POST /wallet/add-swig call to finish registration (Step 4) yourself.
 *
 * Usage (secrets via env so they never hit shell history):
 *   GATEWAY_PASSPHRASE=<pass> \                        # encrypts the generated delegate key
 *   GATEWAY_SWIG_OWNER_ADDRESS=<Ledger or keystore pubkey> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *   GATEWAY_SWIG_TOKEN_LIMITS=<mint:amount,...> \      # per-mint spend caps, base units
 *   [GATEWAY_SWIG_NETWORK=mainnet-beta] \
 *   [GATEWAY_SWIG_ALLOWED_PROGRAMS=<programId,...>] \  # default: Orca + Meteora + token programs
 *   [GATEWAY_SWIG_FUND_DELEGATE_SOL=<sol>] \           # owner sends SOL to the delegate for fees
 *   [GATEWAY_SWIG_FUND_WALLET_TOKENS=<mint:amount,...>] \  # owner sends tokens to the Swig wallet
 *     pnpm swig:setup
 */

import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

import {
  DEFAULT_ALLOWED_PROGRAMS,
  ensureHardwareOwnerRegistered,
  generateAndSaveDelegate,
  loadOwnerSigner,
  parseTokenLimits,
  provisionSwig,
  requirePassphrase,
} from './lib';

const USAGE = `
Required environment variables:
  GATEWAY_PASSPHRASE            Gateway passphrase (encrypts the new delegate key)
  GATEWAY_SWIG_OWNER_ADDRESS    Owner pubkey — your Ledger address (or a keystore wallet)
  GATEWAY_SWIG_TOKEN_LIMITS     Per-mint spend caps, base units: <mint:amount,...>
                                e.g. 50 USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000
Optional:
  GATEWAY_SWIG_RPC_URL          Solana RPC (default: public mainnet — use a private one)
  GATEWAY_SWIG_NETWORK          mainnet-beta (default) | devnet
  GATEWAY_SWIG_ALLOWED_PROGRAMS Program allowlist (default: Orca + Meteora + token programs)
  GATEWAY_SWIG_FUND_DELEGATE_SOL   SOL the owner sends the delegate for fees, e.g. 0.03
  GATEWAY_SWIG_FUND_WALLET_TOKENS  Tokens the owner sends the Swig wallet: <mint:amount,...>

Example (Ledger owner, 50 USDC cap, fund 10 USDC + 0.03 SOL):
  GATEWAY_PASSPHRASE=<pass> \\
  GATEWAY_SWIG_OWNER_ADDRESS=<your Ledger Solana address> \\
  GATEWAY_SWIG_RPC_URL=<your rpc url> \\
  GATEWAY_SWIG_TOKEN_LIMITS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000 \\
  GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03 \\
  GATEWAY_SWIG_FUND_WALLET_TOKENS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:10000000 \\
    pnpm swig:setup
`;

function banner(step: string): void {
  console.log(`\n━━━ ${step} ${'━'.repeat(Math.max(0, 72 - step.length))}`);
}

/** Validate ALL inputs and report every problem at once, so users fix them in one pass. */
function validateInputs(): string[] {
  const problems: string[] = [];
  try {
    requirePassphrase();
  } catch (e: any) {
    problems.push(e.message);
  }
  if (process.env.GATEWAY_SWIG_DELEGATE_ADDRESS) {
    problems.push(
      'Do not set GATEWAY_SWIG_DELEGATE_ADDRESS — this script always creates a fresh delegate. ' +
        'To provision against an existing delegate, use scripts/swig/create-swig-wallet.ts.',
    );
  }
  if (process.env.GATEWAY_SWIG_OWNER_KEY) {
    // Allowed for parity with create-swig-wallet.ts, but nudge toward safer options.
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
  try {
    const limits = parseTokenLimits(process.env.GATEWAY_SWIG_TOKEN_LIMITS);
    if (limits.length === 0) {
      problems.push(
        'Set GATEWAY_SWIG_TOKEN_LIMITS (per-mint spend caps). Refusing to create an uncapped delegate role.',
      );
    }
    limits.forEach((l) => new PublicKey(l.mint));
  } catch (e: any) {
    problems.push(`GATEWAY_SWIG_TOKEN_LIMITS invalid: ${e.message}`);
  }
  try {
    parseTokenLimits(process.env.GATEWAY_SWIG_FUND_WALLET_TOKENS).forEach((l) => new PublicKey(l.mint));
  } catch (e: any) {
    problems.push(`GATEWAY_SWIG_FUND_WALLET_TOKENS invalid: ${e.message}`);
  }
  if (!process.env.GATEWAY_SWIG_RPC_URL) {
    console.log('⚠ GATEWAY_SWIG_RPC_URL not set — using the public RPC, which rate-limits hard.');
  }
  return problems;
}

/** Check the owner actually holds what the funding steps will send, before any signing. */
async function preflightOwnerBalances(
  connection: Connection,
  ownerPk: PublicKey,
  fundDelegateSol: string | undefined,
  fundWalletTokens: { mint: string; amount: bigint }[],
): Promise<string[]> {
  const problems: string[] = [];
  const solBalance = await connection.getBalance(ownerPk);
  // Rent for the Swig account + tx fees is small; 0.01 SOL of headroom is plenty.
  const neededLamports = Math.round((Number(fundDelegateSol || 0) + 0.01) * LAMPORTS_PER_SOL);
  console.log(
    `Owner SOL balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} (needs ~${(neededLamports / LAMPORTS_PER_SOL).toFixed(4)})`,
  );
  if (solBalance < neededLamports) {
    problems.push(
      `Owner holds ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL but needs ~${(neededLamports / LAMPORTS_PER_SOL).toFixed(4)} ` +
        '(funding + rent + fees). Top it up or lower GATEWAY_SWIG_FUND_DELEGATE_SOL.',
    );
  }
  for (const { mint, amount } of fundWalletTokens) {
    const mintPk = new PublicKey(mint);
    const mintInfo = await connection.getAccountInfo(mintPk);
    if (!mintInfo) {
      problems.push(`Funding mint not found on-chain: ${mint}`);
      continue;
    }
    const ata = getAssociatedTokenAddressSync(mintPk, ownerPk, false, mintInfo.owner);
    try {
      const balance = await connection.getTokenAccountBalance(ata);
      console.log(`Owner balance of ${mint}: ${balance.value.amount} base units (sending ${amount})`);
      if (BigInt(balance.value.amount) < amount) {
        problems.push(
          `Owner holds ${balance.value.amount} base units of ${mint} but the funding step sends ${amount}.`,
        );
      }
    } catch {
      problems.push(`Owner has no token account for funding mint ${mint}.`);
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

  const network = process.env.GATEWAY_SWIG_NETWORK || 'mainnet-beta';
  const rpcUrl = process.env.GATEWAY_SWIG_RPC_URL || clusterApiUrl(network === 'devnet' ? 'devnet' : 'mainnet-beta');
  const allowedProgramIds = (process.env.GATEWAY_SWIG_ALLOWED_PROGRAMS || DEFAULT_ALLOWED_PROGRAMS.join(','))
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const tokenLimits = parseTokenLimits(process.env.GATEWAY_SWIG_TOKEN_LIMITS);
  const fundDelegateSol = process.env.GATEWAY_SWIG_FUND_DELEGATE_SOL;
  const fundWalletTokens = parseTokenLimits(process.env.GATEWAY_SWIG_FUND_WALLET_TOKENS);
  const connection = new Connection(rpcUrl, 'confirmed');

  banner('Step 1/4 · Owner');
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
  console.log(`✓ Owner signer ready: ${owner.publicKey.toBase58()}`);

  banner('Step 2/4 · Preflight');
  console.log(`Network:   ${network}`);
  console.log(`RPC:       ${rpcUrl}`);
  console.log(`Owner:     ${owner.publicKey.toBase58()}`);
  console.log(`Programs:  ${allowedProgramIds.join(', ')}`);
  console.log(`Caps:      ${tokenLimits.map((l) => `${l.mint}=${l.amount}`).join(', ')}`);
  if (fundDelegateSol) console.log(`Fund:      delegate gets ${fundDelegateSol} SOL (fees)`);
  fundWalletTokens.forEach((l) => console.log(`Fund:      Swig wallet gets ${l.amount} base units of ${l.mint}`));
  const balanceProblems = await preflightOwnerBalances(connection, owner.publicKey, fundDelegateSol, fundWalletTokens);
  if (balanceProblems.length > 0) {
    console.error('\nPreflight failed — nothing was signed or sent:');
    balanceProblems.forEach((p) => console.error(`  ✗ ${p}`));
    process.exitCode = 1;
    return;
  }
  console.log('✓ Owner balances cover the plan.');

  // Only mint the delegate once the owner and balances are green, so a failed run doesn't
  // leave orphan key files in the keystore.
  banner('Step 3/4 · Delegate key');
  console.log('Generating a fresh delegate keypair (encrypted into conf/wallets/solana/, never printed) ...');
  const delegateAddress = await generateAndSaveDelegate();
  console.log(`✓ Delegate created: ${delegateAddress}`);

  banner('Step 4/4 · Provision on-chain');
  console.log('If the owner is a Ledger, approve each transaction on the device.');
  let result;
  try {
    result = await provisionSwig({
      owner,
      delegatePublicKey: new PublicKey(delegateAddress),
      connection,
      allowedProgramIds,
      tokenLimits,
      fundDelegateSol,
      fundWalletTokens,
    });
  } catch (error: any) {
    console.error(`\nProvisioning failed: ${error.message}`);
    console.error(`\nThe delegate key ${delegateAddress} was already saved to the keystore. To retry`);
    console.error('WITHOUT creating another key, provision against it directly:');
    console.error(`  GATEWAY_SWIG_DELEGATE_ADDRESS=${delegateAddress} ... pnpm swig:provision`);
    console.error(`Or delete conf/wallets/solana/${delegateAddress}.json and re-run pnpm swig:setup.`);
    process.exitCode = 1;
    return;
  }

  banner('Done — one step left');
  console.log('Swig wallet provisioned. Its addresses:');
  console.log(`  Trade with (funds owner):  ${result.address}`);
  console.log(`  Swig account (PDA):        ${result.accountAddress}`);
  console.log(`  Delegate (Gateway signs):  ${result.delegateAddress}`);
  console.log('\nRegister it: start Gateway (pnpm start --passphrase=<pass>), then run:\n');
  const payload = { ...result, passphrase: '<YOUR GATEWAY PASSPHRASE>' };
  console.log(`curl -s -X POST http://localhost:15888/wallet/add-swig \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(payload, null, 2)}'`);
  console.log('\nA 200 with "Swig wallet registered successfully" means you are set.');
  console.log(`Then trade using walletAddress=${result.address} on any supported connector.`);
}

main().catch((error) => {
  console.error(`\nFailed to set up Swig wallet: ${error.message}`);
  process.exit(1);
});

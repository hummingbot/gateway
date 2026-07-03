/**
 * Shared building blocks for provisioning a Swig smart-contract wallet.
 *
 * Entry-point scripts (see SETUP.md for the step-by-step guide):
 *   - create-swig.ts   : Step 1 — create the Swig + a bounded delegate (token/System programs
 *                        + SOL cap) in one command; the invariant part of every deploy.
 *   Then, per-step (one owner/Ledger approval each):
 *   - allow-program.ts (venues), add-token.ts (token caps), fund.ts, show.ts (read-only),
 *   - add-delegate.ts (add another/rotated delegate to an existing Swig), revoke-delegate.ts
 *
 * SECURITY: functions here may generate or decrypt keys. Secrets are only ever written
 * to the encrypted keystore (mode 0600) and are NEVER printed or returned.
 */

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import fse from 'fs-extra';

import { SolanaLedger } from '../../src/chains/solana/solana-ledger';
import { getSolanaChainConfig, getSolanaNetworkConfig } from '../../src/chains/solana/solana.config';
import { HardwareWalletService } from '../../src/services/hardware-wallet-service';
import { redactUrl } from '../../src/services/logger';
import { encryptSecret, decryptSecret } from '../../src/services/secure-keystore';
import { getSwigService, SwigTokenLimit } from '../../src/wallet/swig';
import {
  getHardwareWalletByAddress,
  getHardwareWallets,
  saveHardwareWallets,
  getSafeWalletFilePath,
  mkdirIfDoesNotExist,
  HardwareWalletData,
} from '../../src/wallet/utils';

// Secrets are NEVER read from the env file — the passphrase (and any raw key) must come from a
// real environment variable, exported per session, so it isn't persisted next to the keystore.
const ENV_FILE_SECRET_KEYS = new Set(['GATEWAY_PASSPHRASE', 'GATEWAY_SWIG_OWNER_KEY']);

/**
 * Auto-load conf/swig.env (or SWIG_ENV_FILE) so operators can persist the non-secret
 * GATEWAY_SWIG_* values between sessions instead of exporting them every time. Runs once at
 * import, i.e. for every swig:* script. Real environment variables always win — the file only
 * fills in what's unset — so a one-off override like `GATEWAY_SWIG_VENUES=orca pnpm swig:...`
 * works. Secrets (ENV_FILE_SECRET_KEYS) are skipped even if present.
 */
function loadSwigEnvFile(): void {
  const envPath = process.env.SWIG_ENV_FILE || 'conf/swig.env';
  if (!fse.pathExistsSync(envPath)) return;
  let loaded = 0;
  for (const line of fse.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (ENV_FILE_SECRET_KEYS.has(key)) {
      console.log(
        `⚠ Ignoring ${key} in ${envPath} — export it as an environment variable instead; secrets are not read from the file.`,
      );
      continue;
    }
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1).trim();
      loaded++;
    }
  }
  if (loaded > 0) console.log(`Loaded ${loaded} setting(s) from ${envPath}`);
}
loadSwigEnvFile();

// Every venue's swap CPIs into the token/ATA programs, so a delegate role always needs
// these. System is required for native-SOL wraps and position rent (any wallet-paid
// lamport transfer) — harmless on its own because every lamport debit is still tallied
// against the role's SOL cap, and with no cap set the Swig program blocks it anyway.
// On their own these programs let the delegate move nothing: default-deny still holds
// because no mint is capped, no SOL cap is set, and no venue program is allowed yet.
export const BASE_TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // SPL Token-2022 (USDM1)
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Account
  '11111111111111111111111111111111', // System (wraps + rent; bounded by the SOL cap)
];

// Named venue → program ids for the delegate allowlist. Every program a wrapped instruction
// touches must be allowed or the Swig program rejects the sign (0xbbe). ComputeBudget is NOT
// needed: its instructions stay top-level (unwrapped) and never run under the Swig role.
// Jupiter is deliberately absent — an aggregator routes through arbitrary programs, so a
// Jupiter wallet stays token-cap-only (no program allowlist can cover it).
export const VENUE_PROGRAMS: Record<string, string[]> = {
  orca: ['whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'], // Orca Whirlpools
  meteora: ['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'], // Meteora DLMM
  'raydium-amm': ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'], // Raydium AMM v4
  'raydium-clmm': ['CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'], // Raydium CLMM
};
// Any other protocol (a treasury program, a custom vault, …) is allowlisted by raw id via
// GATEWAY_SWIG_PROGRAM_IDS. To find the right id(s), inspect a successful transaction of the
// operation on-chain: every program in the invoke logs except ComputeBudget (which stays
// top-level/unwrapped) and programs already allowed must be added, or the sign fails (0xbbe).

// Default allowlist for the one-shot setup: token programs + the mainnet-verified venues.
export const DEFAULT_ALLOWED_PROGRAMS = [...VENUE_PROGRAMS.orca, ...VENUE_PROGRAMS.meteora, ...BASE_TOKEN_PROGRAMS];

/** Resolve GATEWAY_SWIG_VENUES (named) and/or GATEWAY_SWIG_PROGRAM_IDS (raw) to program ids. */
export function resolveVenuePrograms(venuesRaw: string | undefined, programIdsRaw: string | undefined): string[] {
  const programIds: string[] = [];
  for (const venue of (venuesRaw || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)) {
    if (venue === 'jupiter') {
      throw new Error(
        'Jupiter has no program allowlist preset: an aggregator routes through arbitrary programs, ' +
          'so a Jupiter wallet must stay token-cap-only (skip allow-program; rely on swig:add-token caps).',
      );
    }
    const programs = VENUE_PROGRAMS[venue];
    if (!programs) {
      throw new Error(`Unknown venue "${venue}". Known venues: ${Object.keys(VENUE_PROGRAMS).join(', ')}`);
    }
    programIds.push(...programs);
  }
  for (const id of (programIdsRaw || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    new PublicKey(id); // validate
    programIds.push(id);
  }
  if (programIds.length === 0) {
    throw new Error(
      `Set GATEWAY_SWIG_VENUES (${Object.keys(VENUE_PROGRAMS).join(', ')}) and/or GATEWAY_SWIG_PROGRAM_IDS=<id,...>`,
    );
  }
  return [...new Set(programIds)];
}

/**
 * Shared connection resolution for every swig script. Network and RPC come from Gateway's own
 * Solana config in conf/ (solana.defaultNetwork and the network's nodeURL) so the scripts talk
 * to the same node the server does — no separate RPC to configure. GATEWAY_SWIG_NETWORK /
 * GATEWAY_SWIG_RPC_URL still override for one-offs.
 */
export function getConnectionFromEnv(): { network: string; rpcUrl: string; connection: Connection } {
  const network = process.env.GATEWAY_SWIG_NETWORK || getSolanaChainConfig().defaultNetwork;
  let rpcUrl = process.env.GATEWAY_SWIG_RPC_URL;
  if (rpcUrl) {
    console.log(`RPC: ${redactUrl(rpcUrl)} (from GATEWAY_SWIG_RPC_URL)`);
  } else {
    rpcUrl = getSolanaNetworkConfig(network).nodeURL;
    if (!rpcUrl) {
      throw new Error(
        `No nodeURL configured for solana ${network} in conf/chains/solana/${network}.yml. ` +
          'Set it there, or pass GATEWAY_SWIG_RPC_URL=<rpc url>.',
      );
    }
    console.log(`RPC: ${redactUrl(rpcUrl)} (from conf/chains/solana/${network}.yml)`);
  }
  return { network, rpcUrl, connection: new Connection(rpcUrl, 'confirmed') };
}

/** The default Solana wallet from Gateway config (solana.defaultWallet); '' when unset. */
export function getDefaultSolanaWallet(): string {
  return getSolanaChainConfig().defaultWallet || '';
}

/** The Swig account (PDA) targeted by a per-step script. Printed by swig:create. */
export function requireSwigAccount(): PublicKey {
  const raw = process.env.GATEWAY_SWIG_ACCOUNT;
  if (!raw) {
    throw new Error('Set GATEWAY_SWIG_ACCOUNT=<Swig account (PDA) address> — printed by pnpm swig:create.');
  }
  return new PublicKey(raw);
}

/**
 * The owner (root) authority that signs the create + add-delegate + funding transactions.
 * It can be a software keypair (base58 or the encrypted keystore) or a hardware wallet
 * (Ledger) — the wallet type only affects how a transaction is signed.
 */
export interface OwnerSigner {
  readonly publicKey: PublicKey;
  /** Sign the owner-only transaction and broadcast it, returning the signature. */
  signAndSend(connection: Connection, tx: Transaction): Promise<string>;
}

/** Software owner: signs in-process with its keypair. */
export class KeypairOwnerSigner implements OwnerSigner {
  constructor(private readonly keypair: Keypair) {}
  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }
  async signAndSend(connection: Connection, tx: Transaction): Promise<string> {
    // sendAndConfirmTransaction fills in fee payer (signer[0]) and a recent blockhash.
    return sendAndConfirmTransaction(connection, tx, [this.keypair]);
  }
}

/** Hardware owner: the key never leaves the Ledger; each tx is confirmed on the device. */
export class LedgerOwnerSigner implements OwnerSigner {
  private readonly ledger = new SolanaLedger();
  constructor(public readonly publicKey: PublicKey) {}
  async signAndSend(connection: Connection, tx: Transaction): Promise<string> {
    // We sign manually, so the fee payer and blockhash must be set before signing.
    tx.feePayer = this.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    const signed = (await this.ledger.signTransaction(this.publicKey.toBase58(), tx)) as Transaction;
    const signature = await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: 'confirmed' });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    return signature;
  }
}

/**
 * Resolve a signer for any Gateway-managed Solana address:
 *   - a registered hardware wallet  → sign on the Ledger (each tx approved on the device);
 *   - otherwise an encrypted keystore wallet → decrypt with the passphrase and sign in-process.
 * Used for both the Swig owner (root) and the funding source, so either can be a Ledger or a
 * plain keystore wallet.
 */
export async function loadSignerForAddress(address: string, role: string): Promise<OwnerSigner> {
  const hardwareWallet = await getHardwareWalletByAddress('solana', address);
  if (hardwareWallet) {
    console.log(`${role} is a hardware wallet (Ledger) — connect it, open the Solana app, enable`);
    console.log('  blind signing (Swig instructions are custom-program calls), and approve on the device.');
    return new LedgerOwnerSigner(new PublicKey(address));
  }
  const passphrase = requirePassphrase();
  const filePath = getSafeWalletFilePath('solana', address);
  if (!(await fse.pathExists(filePath))) {
    throw new Error(
      `${role} ${address} is neither a registered Ledger nor an encrypted keystore wallet in conf/wallets/solana/.`,
    );
  }
  const encrypted = await fse.readFile(filePath, 'utf8');
  const decrypted = decryptSecret(encrypted, passphrase);
  console.log(`${role} is a keystore wallet (${address}) — signs in-process, no device needed.`);
  return new KeypairOwnerSigner(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(decrypted))));
}

/**
 * Resolve the owner (root) signer. Precedence:
 *   1. GATEWAY_SWIG_OWNER_KEY  — raw base58 secret (software).
 *   2. GATEWAY_SWIG_OWNER_ADDRESS — a registered Ledger, else an encrypted keystore wallet.
 */
export async function loadOwnerSigner(): Promise<OwnerSigner> {
  const ownerKey = process.env.GATEWAY_SWIG_OWNER_KEY;
  if (ownerKey) {
    return new KeypairOwnerSigner(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(ownerKey))));
  }
  const ownerAddress = process.env.GATEWAY_SWIG_OWNER_ADDRESS;
  if (!ownerAddress) {
    throw new Error('Set GATEWAY_SWIG_OWNER_ADDRESS (keystore or hardware) or GATEWAY_SWIG_OWNER_KEY (base58 secret)');
  }
  return loadSignerForAddress(ownerAddress, 'Owner');
}

/**
 * Read the Gateway passphrase from GATEWAY_PASSPHRASE or --passphrase=… and THROW if absent.
 *
 * Deliberately not ConfigManagerCertPassphrase.readPassphrase(): that helper calls
 * process.exit() (status 0!) and logs only to the winston file transport, so a missing
 * passphrase would kill these scripts silently with a success exit code.
 */
export function requirePassphrase(): string {
  const fromArg = process.argv
    .find((a) => a.startsWith('--passphrase='))
    ?.split('=')
    .slice(1)
    .join('=');
  const passphrase = fromArg || process.env.GATEWAY_PASSPHRASE;
  if (!passphrase) {
    throw new Error('Gateway passphrase required: set GATEWAY_PASSPHRASE=<pass> or pass --passphrase=<pass>.');
  }
  return passphrase;
}

/** Parse GATEWAY_SWIG_SOL_LIMIT (whole SOL) into lamports, or undefined if unset. */
export function parseSolLimitLamports(raw: string | undefined): bigint | undefined {
  if (!raw) return undefined;
  const lamports = Math.round(Number(raw) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error(`Invalid GATEWAY_SWIG_SOL_LIMIT: ${raw}`);
  }
  return BigInt(lamports);
}

export function parseTokenLimits(raw: string | undefined): SwigTokenLimit[] {
  if (!raw) return [];
  return raw.split(',').map((entry) => {
    const [mint, amount] = entry.split(':');
    if (!mint || !amount) {
      throw new Error(`Invalid token limit "${entry}". Expected format mint:amount`);
    }
    return { mint: mint.trim(), amount: BigInt(amount.trim()) };
  });
}

/**
 * Generate a fresh delegate keypair and store it ENCRYPTED in the Gateway keystore, so
 * Gateway can later sign Swig transactions with it. Returns only the public address — the
 * secret is written to disk (mode 0600) and never printed or returned.
 *
 * Requires the Gateway passphrase (GATEWAY_PASSPHRASE or --passphrase) to encrypt the key.
 */
export async function generateAndSaveDelegate(): Promise<string> {
  // Same passphrase-derived key Gateway uses to encrypt wallets added via POST /wallet/add.
  const walletKey = requirePassphrase();
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const secretBase58 = bs58.encode(keypair.secretKey);

  const filePath = getSafeWalletFilePath('solana', address);
  await mkdirIfDoesNotExist(filePath.slice(0, filePath.lastIndexOf('/')));
  // Same encryption + owner-only permissions as POST /wallet/add.
  const encrypted = encryptSecret(secretBase58, walletKey);
  await fse.writeFile(filePath, encrypted, { mode: 0o600 });
  await fse.chmod(filePath, 0o600);
  return address;
}

/**
 * Default one-time SOL cap for a bounded delegate. The SOL cap is not optional in practice:
 * swaps routinely make the wallet pay small lamport debits (ATA rent when it creates a token
 * account, native-SOL wraps), and the Swig program tallies every wallet-lamport decrease
 * against this cap — with none set the swap executes and is then rejected post-run with 0xbbe.
 * 0.1 SOL covers ~50 account creations and bounds the wallet SOL a compromised delegate could
 * move. Because it is a mandatory basic, every provisioning path sets it; override per deploy.
 */
export const DEFAULT_SOL_LIMIT_SOL = '0.1';

/**
 * Resolve the delegate's one-time SOL cap from GATEWAY_SWIG_SOL_LIMIT, defaulting to
 * DEFAULT_SOL_LIMIT_SOL, and log which value was used (no hidden magic).
 */
export function resolveDelegateSolLimit(): bigint {
  const raw = process.env.GATEWAY_SWIG_SOL_LIMIT;
  const lamports = parseSolLimitLamports(raw ?? DEFAULT_SOL_LIMIT_SOL) as bigint;
  console.log(
    raw
      ? `SOL cap: ${raw} SOL (from GATEWAY_SWIG_SOL_LIMIT).`
      : `SOL cap: ${DEFAULT_SOL_LIMIT_SOL} SOL (default; override with GATEWAY_SWIG_SOL_LIMIT).`,
  );
  return lamports;
}

/**
 * Generate a FRESH delegate keypair (encrypted into the keystore, never printed) and build the
 * owner-signed instructions that add its bounded role to an existing Swig: the baseline
 * token/System programs plus the SOL cap — but NO trading venues and NO token caps yet. Those
 * are the deploy-specific grants (swig:allow-program, swig:add-token). Returns the new delegate
 * address and the instructions for the owner to sign. Reusing an existing wallet as the
 * delegate is never supported — the whole design is that Gateway's key controls nothing else.
 */
export async function buildFreshDelegateRole(
  connection: Connection,
  accountAddress: PublicKey,
  ownerPublicKey: PublicKey,
  solLimitLamports: bigint,
): Promise<{ delegateAddress: string; instructions: TransactionInstruction[] }> {
  const delegateAddress = await generateAndSaveDelegate();
  const instructions = await getSwigService().buildAddDelegateInstructions(
    connection,
    accountAddress,
    ownerPublicKey,
    new PublicKey(delegateAddress),
    { allowedProgramIds: BASE_TOKEN_PROGRAMS, tokenLimits: [], solLimitLamports },
  );
  return { delegateAddress, instructions };
}

/**
 * Ensure the owner address is registered as a Solana hardware wallet. If it already is,
 * this is a no-op. Otherwise it queries the connected Ledger (searching the standard
 * derivation paths) to confirm the address is derivable and records its path — the same
 * verification POST /wallet/add-hardware does.
 */
export async function ensureHardwareOwnerRegistered(ownerAddress: string): Promise<HardwareWalletData> {
  const existing = await getHardwareWalletByAddress('solana', ownerAddress);
  if (existing) return existing;

  const service = HardwareWalletService.getInstance();
  if (!(await service.isDeviceConnected())) {
    throw new Error('No Ledger device found. Connect it, unlock it, and open the Solana app.');
  }

  // Search the standard account indices, then the alternative path, for the owner address.
  const paths = [...Array.from({ length: 8 }, (_, i) => `44'/501'/${i}'`), `44'/501'/0'/0'`];
  let found: HardwareWalletData | undefined;
  for (const derivationPath of paths) {
    try {
      const info = await service.getSolanaAddress(derivationPath);
      if (info.address.toLowerCase() === ownerAddress.toLowerCase()) {
        found = info;
        break;
      }
    } catch (error: any) {
      if (error.message?.includes('0x5515') || error.message?.includes('Locked device')) {
        throw new Error('Ledger device is locked. Unlock it and open the Solana app.');
      }
      if (error.message?.includes('0x6a83') || error.message?.includes('UNKNOWN_ERROR')) {
        throw new Error('Wrong Ledger app is open. Open the Solana app on the device.');
      }
      // Otherwise keep trying the remaining paths.
    }
  }
  if (!found) {
    throw new Error(
      `Address ${ownerAddress} not found on the Ledger (checked 44'/501'/0'..7' and 44'/501'/0'/0'). ` +
        'Ensure this address was generated from the connected device.',
    );
  }

  const wallets = await getHardwareWallets('solana');
  wallets.push(found);
  await saveHardwareWallets('solana', wallets);
  return found;
}

/**
 * Build ONE transaction that funds the delegate with SOL (fees) and/or the Swig wallet with
 * tokens, so a hardware owner approves a single time. Returns null if nothing to fund.
 */
export async function buildFundTransaction(
  connection: Connection,
  ownerPk: PublicKey,
  delegatePk: PublicKey | null,
  swigWalletPk: PublicKey,
  fundDelegateSol: string | undefined,
  fundWalletTokens: SwigTokenLimit[],
  fundWalletSol?: string,
): Promise<Transaction | null> {
  const tx = new Transaction();
  if (fundDelegateSol) {
    if (!delegatePk) {
      throw new Error('GATEWAY_SWIG_FUND_DELEGATE_SOL set but no delegate address to send it to.');
    }
    const lamports = Math.round(Number(fundDelegateSol) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error(`Invalid GATEWAY_SWIG_FUND_DELEGATE_SOL: ${fundDelegateSol}`);
    }
    console.log(`  + send ${fundDelegateSol} SOL to delegate ${delegatePk.toBase58()}`);
    tx.add(SystemProgram.transfer({ fromPubkey: ownerPk, toPubkey: delegatePk, lamports }));
  }
  if (fundWalletSol) {
    // The Swig funds-owner PDA is created holding exactly the rent-exempt minimum. DEX SDKs
    // simulate with the wallet as payer, so without SOL headroom every simulation fails with
    // InsufficientFundsForRent — native-SOL wraps need real balance too.
    const lamports = Math.round(Number(fundWalletSol) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error(`Invalid GATEWAY_SWIG_FUND_WALLET_SOL: ${fundWalletSol}`);
    }
    console.log(`  + send ${fundWalletSol} SOL to Swig wallet ${swigWalletPk.toBase58()}`);
    tx.add(SystemProgram.transfer({ fromPubkey: ownerPk, toPubkey: swigWalletPk, lamports }));
  }
  for (const { mint, amount } of fundWalletTokens) {
    const mintPk = new PublicKey(mint);
    // Pick the mint's token program (SPL Token vs Token-2022) from its account owner.
    const mintInfo = await connection.getAccountInfo(mintPk);
    if (!mintInfo) throw new Error(`Mint not found: ${mint}`);
    const tokenProgram = mintInfo.owner;
    const ownerAta = getAssociatedTokenAddressSync(mintPk, ownerPk, false, tokenProgram);
    // The Swig funds-owner is a PDA (off-curve), so allowOwnerOffCurve = true.
    const destAta = getAssociatedTokenAddressSync(mintPk, swigWalletPk, true, tokenProgram);
    console.log(`  + send ${amount} base units of ${mint} to Swig wallet ${swigWalletPk.toBase58()}`);
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(ownerPk, destAta, swigWalletPk, mintPk, tokenProgram),
      createTransferInstruction(ownerAta, destAta, ownerPk, amount, [], tokenProgram),
    );
  }
  return tx.instructions.length > 0 ? tx : null;
}

/**
 * Print the wallet's live policy: each role's program permissions (probed against the known
 * venue presets + any extra ids) and token caps (probed against the given mints). Swig
 * actions aren't enumerable client-side, so this probes known values — pass extra program
 * ids / mints to check anything beyond the presets.
 */
export async function printPolicy(
  connection: Connection,
  accountAddress: PublicKey,
  extraProgramIds: string[] = [],
  mints: string[] = [],
): Promise<void> {
  const swigService = getSwigService();
  const swig = await swigService.fetchSwig(connection, accountAddress);
  const walletPk = await swigService.getWalletAddress(swig);

  console.log(`Swig account (PDA):  ${accountAddress.toBase58()}`);
  console.log(`Funds owner (trade with this address): ${walletPk.toBase58()}`);
  const solBalance = await connection.getBalance(walletPk);
  console.log(`Wallet SOL balance:  ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)}`);

  const probePrograms: [string, string][] = [
    ...Object.entries(VENUE_PROGRAMS).flatMap(([venue, ids]): [string, string][] =>
      ids.map((id): [string, string] => [venue, id]),
    ),
    ...BASE_TOKEN_PROGRAMS.map((id): [string, string] => ['token-programs', id]),
    ...extraProgramIds.map((id): [string, string] => ['custom', id]),
  ];

  for (const role of swig.roles) {
    const actions: any = (role as any).actions;
    const label = actions?.isRoot?.() ? 'OWNER/ROOT (full control)' : 'delegate (bounded)';
    console.log(`\nRole ${role.id} — ${label}`);
    if (actions?.isRoot?.()) continue;
    const allowed = probePrograms.filter(([, id]) => actions.canUseProgram(new PublicKey(id)));
    console.log(
      `  Programs allowed: ${allowed.length ? allowed.map(([v, id]) => `${v} (${id})`).join(', ') : '(none probed positive)'}`,
    );
    const solLimit = actions.solSpendLimit?.();
    console.log(
      `  SOL cap: ${solLimit === undefined || solLimit === null ? 'NONE — wallet-paid rent/wraps will fail (grant via GATEWAY_SWIG_SOL_LIMIT on swig:add-token)' : `${Number(solLimit) / 1e9} SOL remaining`}`,
    );
    for (const mint of mints) {
      const limit = actions.tokenSpendLimit?.(new PublicKey(mint));
      console.log(
        `  Cap for ${mint}: ${limit === undefined || limit === null ? 'NOT ALLOWED (no cap set)' : `${limit} base units remaining`}`,
      );
    }
    if (mints.length === 0) {
      console.log('  (pass GATEWAY_SWIG_TOKEN_MINTS=<mint,...> to check spend caps)');
    }
  }
}

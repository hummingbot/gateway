/**
 * Shared building blocks for provisioning a Swig smart-contract wallet.
 *
 * Entry-point scripts (see SETUP.md for the step-by-step guide):
 *   - setup-swig-wallet.ts  : one-shot — generate delegate + register owner + provision
 *   - create-swig-wallet.ts : provision only (delegate already exists)
 *   Per-step scripts, one owner (Ledger) approval each:
 *   - init-swig.ts, add-delegate.ts, allow-program.ts, add-token.ts, fund.ts,
 *     revoke-delegate.ts, and show.ts (read-only policy inspector)
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
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import fse from 'fs-extra';

import { SolanaLedger } from '../../src/chains/solana/solana-ledger';
import { HardwareWalletService } from '../../src/services/hardware-wallet-service';
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

/**
 * Auto-load conf/swig.env (or SWIG_ENV_FILE) so operators can persist the GATEWAY_SWIG_*
 * values between sessions instead of exporting them every time. Runs once at import, i.e.
 * for every swig:* script. Real environment variables always win — the file only fills in
 * what's unset — so a one-off override like `GATEWAY_SWIG_VENUES=orca pnpm swig:...` works.
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
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1).trim();
      loaded++;
    }
  }
  if (loaded > 0) console.log(`Loaded ${loaded} setting(s) from ${envPath}`);
}
loadSwigEnvFile();

// Every venue's swap CPIs into the token/ATA programs, so a delegate role always needs
// these. On their own they let the delegate move nothing: default-deny still holds because
// no mint is capped and no venue program is allowed yet.
export const BASE_TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // SPL Token-2022 (USDM1)
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Account
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

/** Shared env resolution for the per-step scripts: network, RPC connection. */
export function getConnectionFromEnv(): { network: string; rpcUrl: string; connection: Connection } {
  const network = process.env.GATEWAY_SWIG_NETWORK || 'mainnet-beta';
  const rpcUrl = process.env.GATEWAY_SWIG_RPC_URL || clusterApiUrl(network === 'devnet' ? 'devnet' : 'mainnet-beta');
  if (!process.env.GATEWAY_SWIG_RPC_URL) {
    console.log('⚠ GATEWAY_SWIG_RPC_URL not set — using the public RPC, which rate-limits hard.');
  }
  return { network, rpcUrl, connection: new Connection(rpcUrl, 'confirmed') };
}

/** The Swig account (PDA) targeted by a per-step script. Printed by swig:init. */
export function requireSwigAccount(): PublicKey {
  const raw = process.env.GATEWAY_SWIG_ACCOUNT;
  if (!raw) {
    throw new Error('Set GATEWAY_SWIG_ACCOUNT=<Swig account (PDA) address> — printed by pnpm swig:init.');
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
 * Resolve the owner signer. Precedence:
 *   1. GATEWAY_SWIG_OWNER_KEY  — raw base58 secret (software).
 *   2. GATEWAY_SWIG_OWNER_ADDRESS registered as a hardware wallet — sign on the Ledger.
 *   3. GATEWAY_SWIG_OWNER_ADDRESS in the encrypted keystore — decrypt with the passphrase.
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

  // Hardware wallet takes precedence: if the owner address is a registered Ledger, sign on it.
  const hardwareWallet = await getHardwareWalletByAddress('solana', ownerAddress);
  if (hardwareWallet) {
    console.log('Owner is a hardware wallet (Ledger).');
    console.log('  Connect it, open the Solana app, and enable blind signing (the Swig');
    console.log('  create/add-delegate instructions are custom-program calls). You will');
    console.log('  approve several transactions on the device.');
    return new LedgerOwnerSigner(new PublicKey(ownerAddress));
  }

  // Otherwise decrypt the owner keypair from the keystore with the Gateway passphrase.
  const passphrase = requirePassphrase();
  const filePath = getSafeWalletFilePath('solana', ownerAddress);
  const encrypted = await fse.readFile(filePath, 'utf8');
  const decrypted = decryptSecret(encrypted, passphrase);
  return new KeypairOwnerSigner(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(decrypted))));
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

export interface ProvisionParams {
  owner: OwnerSigner;
  delegatePublicKey: PublicKey;
  connection: Connection;
  allowedProgramIds: string[];
  tokenLimits: SwigTokenLimit[];
  /** Owner sends this much SOL to the delegate for fees (optional). */
  fundDelegateSol?: string;
  /** Owner sends these tokens (base units) to the new Swig wallet (optional). */
  fundWalletTokens?: SwigTokenLimit[];
}

export interface ProvisionResult {
  network: string;
  accountAddress: string;
  address: string;
  ownerAddress: string;
  delegateAddress: string;
  id: string;
}

/**
 * Create the Swig, add the restricted delegate role, and optionally fund the delegate (SOL)
 * and the Swig wallet (tokens) from the owner. Every owner-signed step goes through
 * `owner.signAndSend` (keypair or Ledger). Returns the registration payload for
 * POST /wallet/add-swig.
 */
export async function provisionSwig(params: ProvisionParams): Promise<ProvisionResult> {
  const { owner, delegatePublicKey, connection, allowedProgramIds, tokenLimits } = params;
  const network = process.env.GATEWAY_SWIG_NETWORK || 'mainnet-beta';
  const swigService = getSwigService();

  if (tokenLimits.length === 0) {
    throw new Error('No token spend caps set. Refusing to create an uncapped delegate role.');
  }

  // 1. Create the Swig with the owner as root authority.
  const { id, accountAddress, createInstruction } = await swigService.buildCreateInstruction({
    payer: owner.publicKey,
    ownerPublicKey: owner.publicKey,
  });
  console.log(`\nCreating Swig account ${accountAddress.toBase58()} ...`);
  const createSig = await owner.signAndSend(connection, new Transaction().add(createInstruction));
  console.log(`  created (tx ${createSig})`);

  // 2. Add the restricted delegate role (signed by the owner).
  console.log('Adding restricted delegate role ...');
  const addInstructions = await swigService.buildAddDelegateInstructions(
    connection,
    accountAddress,
    owner.publicKey,
    delegatePublicKey,
    { allowedProgramIds, tokenLimits },
  );
  const addSig = await owner.signAndSend(connection, new Transaction().add(...addInstructions));
  console.log(`  added (tx ${addSig})`);

  // 3. Resolve the funds-owner address used by connectors.
  const swig = await swigService.fetchSwig(connection, accountAddress);
  const walletPk = await swigService.getWalletAddress(swig);
  const walletAddress = walletPk.toBase58();

  // 4. (Optional) Fund from the owner — no separate wallet needed. The delegate needs SOL to
  // pay fees; the Swig wallet needs the input token to trade.
  if (params.fundDelegateSol) {
    const lamports = Math.round(Number(params.fundDelegateSol) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error(`Invalid GATEWAY_SWIG_FUND_DELEGATE_SOL: ${params.fundDelegateSol}`);
    }
    console.log(`\nFunding delegate ${delegatePublicKey.toBase58()} with ${params.fundDelegateSol} SOL ...`);
    const ix = SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: delegatePublicKey, lamports });
    const sig = await owner.signAndSend(connection, new Transaction().add(ix));
    console.log(`  funded (tx ${sig})`);
  }

  for (const { mint, amount } of params.fundWalletTokens ?? []) {
    const mintPk = new PublicKey(mint);
    // Pick the mint's token program (SPL Token vs Token-2022) from its account owner.
    const mintInfo = await connection.getAccountInfo(mintPk);
    if (!mintInfo) throw new Error(`Mint not found: ${mint}`);
    const tokenProgram = mintInfo.owner;
    const ownerAta = getAssociatedTokenAddressSync(mintPk, owner.publicKey, false, tokenProgram);
    // The Swig funds-owner is a PDA (off-curve), so allowOwnerOffCurve = true.
    const destAta = getAssociatedTokenAddressSync(mintPk, walletPk, true, tokenProgram);
    console.log(`\nFunding Swig wallet ${walletAddress} with ${amount} (base units) of ${mint} ...`);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, destAta, walletPk, mintPk, tokenProgram),
      createTransferInstruction(ownerAta, destAta, owner.publicKey, amount, [], tokenProgram),
    );
    const sig = await owner.signAndSend(connection, tx);
    console.log(`  funded (tx ${sig})`);
  }

  return {
    network,
    accountAddress: accountAddress.toBase58(),
    address: walletAddress,
    ownerAddress: owner.publicKey.toBase58(),
    delegateAddress: delegatePublicKey.toBase58(),
    id: bs58.encode(id),
  };
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

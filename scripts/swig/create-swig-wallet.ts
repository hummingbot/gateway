/**
 * Provision a Swig smart-contract wallet for Gateway (run OFFLINE — uses the owner key).
 *
 * Creates a Swig wallet whose root authority is your owner key, then adds a restricted
 * "delegate" role that Gateway signs with. The delegate is limited to the allowlisted
 * programs (Orca + Meteora + token programs by default) and per-mint spend caps, so a
 * compromised Gateway can only swap on the allowed venues up to the cap — it can never move
 * funds elsewhere.
 *
 * The owner key is used ONLY here and never touches the Gateway host. After running,
 * register the printed wallet with: POST /wallet/add-swig.
 *
 * Usage (all via env so secrets never land in shell history files):
 *   # Owner — pick ONE:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<registered hardware/Ledger pubkey>                          # best: key never leaves the device
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey in Gateway keystore> GATEWAY_PASSPHRASE=<pass>  # key stays encrypted on disk
 *   GATEWAY_SWIG_OWNER_KEY=<base58 secret key>                                              # raw secret (least safe)
 *   # (a hardware owner must be added first via POST /wallet/add-hardware, connected, Solana
 *   #  app open, blind signing enabled; you approve each tx on the device)
 *   GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey already added to Gateway keystore> \
 *   GATEWAY_SWIG_NETWORK=mainnet-beta \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *   GATEWAY_SWIG_TOKEN_LIMITS=<mint:amount,mint:amount> \
 *   [GATEWAY_SWIG_ALLOWED_PROGRAMS=<programId,programId>] \
 *   [GATEWAY_SWIG_FUND_DELEGATE_SOL=<sol>]              # owner sends SOL to the delegate for fees
 *   [GATEWAY_SWIG_FUND_WALLET_TOKENS=<mint:amount>]     # owner sends tokens (base units) to the Swig wallet
 *   npx ts-node scripts/swig/create-swig-wallet.ts
 *
 * Funding is optional and paid by the owner (no separate funding wallet needed). Amounts are
 * base units, matching GATEWAY_SWIG_TOKEN_LIMITS (e.g. 10 USDC = 10000000).
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
import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
import { decryptSecret } from '../../src/services/secure-keystore';
import { getSwigService, SwigTokenLimit } from '../../src/wallet/swig';
import { getHardwareWalletByAddress, getSafeWalletFilePath } from '../../src/wallet/utils';

/**
 * The owner (root) authority that signs the create + add-delegate + funding transactions.
 * It can be a software keypair (base58 or the encrypted keystore) or a hardware wallet
 * (Ledger) — the wallet type only affects how a transaction is signed.
 */
interface OwnerSigner {
  readonly publicKey: PublicKey;
  /** Sign the owner-only transaction and broadcast it, returning the signature. */
  signAndSend(connection: Connection, tx: Transaction): Promise<string>;
}

/** Software owner: signs in-process with its keypair. */
class KeypairOwnerSigner implements OwnerSigner {
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
class LedgerOwnerSigner implements OwnerSigner {
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
async function loadOwnerSigner(): Promise<OwnerSigner> {
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
  const passphrase = ConfigManagerCertPassphrase.readPassphrase();
  if (!passphrase) {
    throw new Error('Owner is in the keystore but no passphrase given (set GATEWAY_PASSPHRASE or --passphrase)');
  }
  const filePath = getSafeWalletFilePath('solana', ownerAddress);
  const encrypted = await fse.readFile(filePath, 'utf8');
  const decrypted = decryptSecret(encrypted, passphrase);
  return new KeypairOwnerSigner(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(decrypted))));
}

// Inner programs an Orca or Meteora swap CPIs into; every one a wrapped instruction touches
// must be whitelisted on the delegate role or the Swig program rejects the sign (0xbbe).
// This is the union for Orca Whirlpools + Meteora DLMM swaps (both venues verified on
// mainnet to touch only their own program plus the token/ATA programs). ComputeBudget is
// NOT here: its instructions stay top-level (unwrapped) and never run under the Swig role.
// To add another venue (e.g. Raydium), append its program id via GATEWAY_SWIG_ALLOWED_PROGRAMS.
const DEFAULT_ALLOWED_PROGRAMS = [
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpools
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora DLMM
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // SPL Token-2022 (USDM1)
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Account
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseTokenLimits(raw: string | undefined): SwigTokenLimit[] {
  if (!raw) return [];
  return raw.split(',').map((entry) => {
    const [mint, amount] = entry.split(':');
    if (!mint || !amount) {
      throw new Error(`Invalid token limit "${entry}". Expected format mint:amount`);
    }
    return { mint: mint.trim(), amount: BigInt(amount.trim()) };
  });
}

async function main(): Promise<void> {
  const delegateAddress = requireEnv('GATEWAY_SWIG_DELEGATE_ADDRESS');
  const network = process.env.GATEWAY_SWIG_NETWORK || 'mainnet-beta';
  const rpcUrl = process.env.GATEWAY_SWIG_RPC_URL || clusterApiUrl(network === 'devnet' ? 'devnet' : 'mainnet-beta');
  const allowedProgramIds = (process.env.GATEWAY_SWIG_ALLOWED_PROGRAMS || DEFAULT_ALLOWED_PROGRAMS.join(','))
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const tokenLimits = parseTokenLimits(process.env.GATEWAY_SWIG_TOKEN_LIMITS);

  if (tokenLimits.length === 0) {
    throw new Error(
      'No token spend caps set (GATEWAY_SWIG_TOKEN_LIMITS). Refusing to create an uncapped delegate role.',
    );
  }

  const owner = await loadOwnerSigner();
  const delegatePublicKey = new PublicKey(delegateAddress);
  const connection = new Connection(rpcUrl, 'confirmed');
  const swigService = getSwigService();

  console.log(`Network:   ${network}`);
  console.log(`RPC:       ${rpcUrl}`);
  console.log(`Owner:     ${owner.publicKey.toBase58()}`);
  console.log(`Delegate:  ${delegateAddress}`);
  console.log(`Programs:  ${allowedProgramIds.join(', ')}`);
  console.log(`Limits:    ${tokenLimits.map((l) => `${l.mint}=${l.amount}`).join(', ')}`);

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

  // 4. (Optional) Fund from the owner, since the owner key is already loaded here — no
  // separate wallet needed. The delegate needs SOL to pay fees; the Swig wallet needs the
  // input token to trade. Both transfers are signed and paid by the owner.
  const fundDelegateSol = process.env.GATEWAY_SWIG_FUND_DELEGATE_SOL;
  if (fundDelegateSol) {
    const lamports = Math.round(Number(fundDelegateSol) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error(`Invalid GATEWAY_SWIG_FUND_DELEGATE_SOL: ${fundDelegateSol}`);
    }
    console.log(`\nFunding delegate ${delegateAddress} with ${fundDelegateSol} SOL ...`);
    const ix = SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: delegatePublicKey, lamports });
    const sig = await owner.signAndSend(connection, new Transaction().add(ix));
    console.log(`  funded (tx ${sig})`);
  }

  const fundWalletTokens = parseTokenLimits(process.env.GATEWAY_SWIG_FUND_WALLET_TOKENS);
  for (const { mint, amount } of fundWalletTokens) {
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

  console.log('\nDone. Register with POST /wallet/add-swig using:');
  console.log(
    JSON.stringify(
      {
        network,
        accountAddress: accountAddress.toBase58(),
        address: walletAddress,
        ownerAddress: owner.publicKey.toBase58(),
        delegateAddress,
        id: bs58.encode(id),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`\nFailed to create Swig wallet: ${error.message}`);
  process.exit(1);
});

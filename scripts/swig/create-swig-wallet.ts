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
 *   GATEWAY_SWIG_OWNER_KEY=<base58 secret key> \
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

import { getSwigService, SwigTokenLimit } from '../../src/wallet/swig';

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
  const ownerKey = requireEnv('GATEWAY_SWIG_OWNER_KEY');
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

  const owner = Keypair.fromSecretKey(Uint8Array.from(bs58.decode(ownerKey)));
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
  const createSig = await sendAndConfirmTransaction(connection, new Transaction().add(createInstruction), [owner]);
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
  const addSig = await sendAndConfirmTransaction(connection, new Transaction().add(...addInstructions), [owner]);
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
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [owner]);
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
    const sig = await sendAndConfirmTransaction(connection, tx, [owner]);
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

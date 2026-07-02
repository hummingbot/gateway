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
 * This script provisions against an EXISTING delegate (GATEWAY_SWIG_DELEGATE_ADDRESS must be a
 * key already in the Gateway keystore). To generate the delegate and register the hardware
 * owner in the same run, use scripts/swig/setup-swig-wallet.ts instead.
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

import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';

import {
  DEFAULT_ALLOWED_PROGRAMS,
  loadOwnerSigner,
  parseSolLimitLamports,
  parseTokenLimits,
  provisionSwig,
} from './lib';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  const connection = new Connection(rpcUrl, 'confirmed');

  console.log(`Network:   ${network}`);
  console.log(`RPC:       ${rpcUrl}`);
  console.log(`Owner:     ${owner.publicKey.toBase58()}`);
  console.log(`Delegate:  ${delegateAddress}`);
  console.log(`Programs:  ${allowedProgramIds.join(', ')}`);
  console.log(`Limits:    ${tokenLimits.map((l) => `${l.mint}=${l.amount}`).join(', ')}`);

  const result = await provisionSwig({
    owner,
    delegatePublicKey: new PublicKey(delegateAddress),
    connection,
    allowedProgramIds,
    tokenLimits,
    solLimitLamports: parseSolLimitLamports(process.env.GATEWAY_SWIG_SOL_LIMIT),
    fundDelegateSol: process.env.GATEWAY_SWIG_FUND_DELEGATE_SOL,
    fundWalletTokens: parseTokenLimits(process.env.GATEWAY_SWIG_FUND_WALLET_TOKENS),
  });

  console.log('\nDone. Register with POST /wallet/add-swig using:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`\nFailed to create Swig wallet: ${error.message}`);
  process.exit(1);
});

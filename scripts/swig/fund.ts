/**
 * swig:fund — fund the delegate with SOL (fees) and/or the Swig wallet with SOL/tokens,
 * combined into ONE transaction = one approval.
 *
 * Funding source (who pays), in precedence order:
 *   1. GATEWAY_SWIG_FUND_FROM   — any Gateway-managed address (a keystore wallet signs in
 *                                 process, no device; a registered Ledger prompts on the device).
 *   2. GATEWAY_SWIG_OWNER_ADDRESS — the Swig owner (typically your Ledger).
 *   3. solana.defaultWallet     — your default Gateway wallet from conf (non-hardware, automatic).
 * So you can fund from your Ledger or from an ordinary keystore wallet, whichever holds the SOL
 * and tokens — funds can come from anywhere; only the amounts are what matter.
 *
 * Network + RPC come from Gateway's Solana config (conf/), overridable with GATEWAY_SWIG_*.
 *
 * Usage:
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   [GATEWAY_SWIG_FUND_FROM=<funder address>] \           # default: owner, else solana.defaultWallet
 *   [GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate pubkey>] \   # required with FUND_DELEGATE_SOL
 *   [GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03] \
 *   [GATEWAY_SWIG_FUND_WALLET_SOL=0.01] \                 # SOL headroom for the wallet PDA (sims/wraps)
 *   [GATEWAY_SWIG_FUND_WALLET_TOKENS=<mint:amount,...>] \  # base units
 *     pnpm swig:fund
 */

import { PublicKey } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig';

import {
  buildFundTransaction,
  getConnectionFromEnv,
  getDefaultSolanaWallet,
  loadSignerForAddress,
  parseTokenLimits,
  requireSwigAccount,
} from './lib';

function resolveFunderAddress(): string {
  const funder =
    process.env.GATEWAY_SWIG_FUND_FROM || process.env.GATEWAY_SWIG_OWNER_ADDRESS || getDefaultSolanaWallet();
  if (!funder) {
    throw new Error(
      'No funding source. Set GATEWAY_SWIG_FUND_FROM=<address>, or GATEWAY_SWIG_OWNER_ADDRESS, ' +
        'or a solana.defaultWallet in Gateway config.',
    );
  }
  new PublicKey(funder); // validate
  return funder;
}

async function main(): Promise<void> {
  const fundDelegateSol = process.env.GATEWAY_SWIG_FUND_DELEGATE_SOL;
  const fundWalletSol = process.env.GATEWAY_SWIG_FUND_WALLET_SOL;
  const fundWalletTokens = parseTokenLimits(process.env.GATEWAY_SWIG_FUND_WALLET_TOKENS);
  if (!fundDelegateSol && !fundWalletSol && fundWalletTokens.length === 0) {
    throw new Error(
      'Nothing to fund: set GATEWAY_SWIG_FUND_DELEGATE_SOL, GATEWAY_SWIG_FUND_WALLET_SOL and/or GATEWAY_SWIG_FUND_WALLET_TOKENS.',
    );
  }
  const { connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const funderAddress = resolveFunderAddress();
  const funder = await loadSignerForAddress(funderAddress, 'Funder');
  const swigService = getSwigService();

  const swig = await swigService.fetchSwig(connection, accountAddress);
  const walletPk = await swigService.getWalletAddress(swig);
  const delegatePk = process.env.GATEWAY_SWIG_DELEGATE_ADDRESS
    ? new PublicKey(process.env.GATEWAY_SWIG_DELEGATE_ADDRESS)
    : null;

  console.log(`\n${funderAddress} will now sign ONE transaction to fund:`);
  const tx = await buildFundTransaction(
    connection,
    funder.publicKey,
    delegatePk,
    walletPk,
    fundDelegateSol,
    fundWalletTokens,
    fundWalletSol,
  );
  if (!tx) throw new Error('Nothing to fund.');
  const sig = await funder.signAndSend(connection, tx);
  console.log(`✓ Funded (tx ${sig})`);
  console.log('\nVerify with: pnpm swig:show');
}

main().catch((error) => {
  console.error(`\nswig:fund failed: ${error.message}`);
  process.exit(1);
});

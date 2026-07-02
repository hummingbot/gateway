/**
 * swig:fund — fund the delegate with SOL (fees) and/or the Swig wallet with tokens from the
 * owner, combined into ONE transaction = one owner (Ledger) approval.
 *
 * Usage:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<owner pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
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
  loadOwnerSigner,
  parseTokenLimits,
  requireSwigAccount,
} from './lib';

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
  const owner = await loadOwnerSigner();
  const swigService = getSwigService();

  const swig = await swigService.fetchSwig(connection, accountAddress);
  const walletPk = await swigService.getWalletAddress(swig);
  const delegatePk = process.env.GATEWAY_SWIG_DELEGATE_ADDRESS
    ? new PublicKey(process.env.GATEWAY_SWIG_DELEGATE_ADDRESS)
    : null;

  console.log('\nThe owner will now sign ONE transaction:');
  const tx = await buildFundTransaction(
    connection,
    owner.publicKey,
    delegatePk,
    walletPk,
    fundDelegateSol,
    fundWalletTokens,
    fundWalletSol,
  );
  if (!tx) throw new Error('Nothing to fund.');
  const sig = await owner.signAndSend(connection, tx);
  console.log(`✓ Funded (tx ${sig})`);
  console.log('\nVerify with: pnpm swig:show');
}

main().catch((error) => {
  console.error(`\nswig:fund failed: ${error.message}`);
  process.exit(1);
});

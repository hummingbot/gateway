/**
 * swig:owner-close — close an (empty) Orca position held by a Swig wallet, signed by the
 * OWNER (root role). One Ledger approval.
 *
 * Why the owner: the Swig program forbids a bounded role from closing a wallet token
 * account that existed before the transaction — and Orca's close burns the pre-existing
 * position-NFT token account — so `POST /connectors/orca/clmm/close-position` can never
 * succeed with the delegate. Roles with `All` permission (the root) skip those checks
 * entirely, so the same instruction wrapped under the root role works.
 *
 * The position must have 0 liquidity and no uncollected fees (run remove-liquidity /
 * collect-fees through Gateway first). Rent is refunded to the Swig wallet.
 *
 * Usage:
 *   GATEWAY_SWIG_OWNER_ADDRESS=<Ledger pubkey> \
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   GATEWAY_SWIG_POSITION=<position address> \
 *   [GATEWAY_SWIG_RPC_URL=<rpc url>] \   # optional — defaults to the network nodeURL in conf/
 *     pnpm swig:owner-close
 */

import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { WhirlpoolContext, WhirlpoolIx, buildWhirlpoolClient } from '@orca-so/whirlpools-sdk';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig';

import { getConnectionFromEnv, loadOwnerSigner, requireSwigAccount } from './lib';

async function main(): Promise<void> {
  const positionRaw = process.env.GATEWAY_SWIG_POSITION;
  if (!positionRaw) {
    throw new Error('Set GATEWAY_SWIG_POSITION=<Orca position address> (see positions-owned).');
  }
  const positionPubkey = new PublicKey(positionRaw);
  const { connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const owner = await loadOwnerSigner();
  const swigService = getSwigService();

  const swig = await swigService.fetchSwig(connection, accountAddress);
  const walletPk = await swigService.getWalletAddress(swig);

  // Read-only wallet carrying the Swig funds-owner key: the SDK only reads publicKey while
  // building instructions; signing happens via the owner (Ledger) on the outer transaction.
  const readOnlyWallet = {
    publicKey: walletPk,
    signTransaction: async () => {
      throw new Error('read-only');
    },
    signAllTransactions: async () => {
      throw new Error('read-only');
    },
  } as unknown as Wallet;
  const provider = new AnchorProvider(connection, readOnlyWallet, { commitment: 'confirmed' });
  const ctx = WhirlpoolContext.withProvider(provider);
  const client = buildWhirlpoolClient(ctx);

  const position = await client.getPosition(positionPubkey);
  const data = position.getData();
  if (!data.liquidity.isZero()) {
    throw new Error(
      `Position still has liquidity (${data.liquidity.toString()}). Remove it first via ` +
        'POST /connectors/orca/clmm/remove-liquidity, then re-run.',
    );
  }
  const mintInfo = await connection.getAccountInfo(data.positionMint);
  if (!mintInfo) throw new Error(`Position mint not found: ${data.positionMint.toBase58()}`);
  const isToken2022 = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
  const closeIxFn = isToken2022 ? WhirlpoolIx.closePositionWithTokenExtensionsIx : WhirlpoolIx.closePositionIx;
  const closeIx = closeIxFn(ctx.program, {
    position: positionPubkey,
    positionAuthority: walletPk,
    positionTokenAccount: getAssociatedTokenAddressSync(
      data.positionMint,
      walletPk,
      true, // allowOwnerOffCurve — the Swig funds owner is a PDA
      isToken2022 ? TOKEN_2022_PROGRAM_ID : undefined,
    ),
    positionMint: data.positionMint,
    receiver: walletPk,
  });

  // Wrap under the OWNER's (root) role — wrapInstructions resolves the role by signer key.
  const inner = [...closeIx.instructions, ...closeIx.cleanupInstructions];
  const wrapped = await swigService.wrapInstructions(swig, owner.publicKey, inner);

  console.log(`\nThe owner will now sign ONE transaction: close Orca position ${positionRaw},`);
  console.log(`burn its NFT (${data.positionMint.toBase58()}), rent refunded to ${walletPk.toBase58()}.`);
  const sig = await owner.signAndSend(connection, new Transaction().add(...wrapped));
  console.log(`✓ Position closed (tx ${sig})`);
}

main().catch((error) => {
  console.error(`\nswig:owner-close failed: ${error.message}`);
  process.exit(1);
});

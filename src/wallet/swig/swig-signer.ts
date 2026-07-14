/**
 * Swig Solana Signer
 *
 * A Swig wallet is a PDA with no private key, so Gateway cannot simply sign a
 * connector-built transaction. Instead this signer REBUILDS the transaction: it pulls
 * out the inner instructions, wraps them in the Swig `sign` instruction (executed via
 * CPI under the delegate role's permissions), and re-assembles a transaction whose fee
 * payer and signer is the delegate keypair.
 *
 * Both legacy and versioned (Address-Lookup-Table) transactions are supported, because
 * the Swig SDK has no ALT handling of its own — the integrator must resolve the lookup
 * tables and recompile the v0 message. The result is always a signed VersionedTransaction.
 */

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { SwigDelegateSigner } from './delegate-signer';
import { getSwigService } from './swig-service';

export interface SwigRebuildOptions {
  /** Extra keypairs that must co-sign (e.g. a new-position keypair). */
  extraSigners?: Keypair[];
  /** Priority fee in micro-lamports per CU, applied only if the tx has no price ix. */
  priorityFeeMicroLamports?: number;
  /** Compute unit limit, applied only if the tx has no limit ix. */
  computeUnitLimit?: number;
}

const DEFAULT_COMPUTE_UNIT_LIMIT = 600_000;

export class SwigSolanaSigner {
  constructor(
    private readonly connection: Connection,
    private readonly accountAddress: PublicKey,
    private readonly delegate: SwigDelegateSigner,
  ) {}

  /**
   * Rebuild a connector transaction so it executes through the Swig wallet, and sign it
   * with the delegate (local keystore or KMS). Returns a signed VersionedTransaction
   * ready to broadcast.
   */
  async rebuildAndSign(
    tx: Transaction | VersionedTransaction,
    options: SwigRebuildOptions = {},
  ): Promise<VersionedTransaction> {
    const swigService = getSwigService();
    const swig = await swigService.fetchSwig(this.connection, this.accountAddress);

    const { instructions, lookupTables } = await this.decompose(tx);

    // Compute-budget instructions stay top-level; everything else is wrapped so the
    // Swig program executes it via CPI under the delegate role.
    const computeBudgetIxs = instructions.filter((ix) => ix.programId.equals(ComputeBudgetProgram.programId));
    const innerInstructions = instructions.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId));
    if (innerInstructions.length === 0) {
      throw new Error('Swig transaction has no instructions to wrap');
    }

    if (computeBudgetIxs.length === 0) {
      computeBudgetIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: options.computeUnitLimit ?? DEFAULT_COMPUTE_UNIT_LIMIT,
        }),
      );
      if (options.priorityFeeMicroLamports && options.priorityFeeMicroLamports > 0) {
        computeBudgetIxs.push(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: Math.floor(options.priorityFeeMicroLamports),
          }),
        );
      }
    }

    // SDK-built transactions (e.g. Jupiter's native-SOL unwrap) append CloseAccount
    // cleanup instructions. Closing a token account the wallet already owned when the
    // transaction starts crashes the deployed Swig program (it snapshots such accounts
    // pre-CPI and panics re-hashing the closed account's empty data — see the swig README
    // known limitations), so drop those closes and leave the balance in the account.
    const walletAddress = await swigService.getWalletAddress(swig);
    const executableInner = await this.dropClosesOfPreexistingWalletTokenAccounts(innerInstructions, walletAddress);
    if (executableInner.length === 0) {
      throw new Error(
        'Swig transaction only closes token accounts the wallet already owns, which the deployed Swig ' +
          'program cannot execute for a bounded delegate (it crashes re-verifying the closed account). ' +
          'Close them with the root owner authority instead.',
      );
    }

    const wrapped = await swigService.wrapInstructions(swig, this.delegate.publicKey, executableInner);

    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: this.delegate.publicKey,
      recentBlockhash: blockhash,
      instructions: [...computeBudgetIxs, ...wrapped],
    }).compileToV0Message(lookupTables);

    const outer = new VersionedTransaction(message);
    // In-process co-signers (e.g. a new-position keypair) sign their own slots first; the
    // delegate then signs the fee-payer slot via its backend (keystore or KMS).
    const extraSigners = options.extraSigners ?? [];
    if (extraSigners.length > 0) {
      outer.sign(extraSigners);
    }
    await this.delegate.sign(outer);
    return outer;
  }

  /**
   * Drop top-level SPL Token / Token-2022 `CloseAccount` instructions that close a token
   * account the wallet ALREADY OWNS on-chain. The deployed Swig program snapshots every
   * pre-existing wallet token account and panics re-hashing it post-CPI if it was closed
   * (anagrambuild/swig-wallet#185), so such closes can never execute under a bounded
   * delegate. Dropping them keeps the rest of the transaction executable: the balance
   * simply stays in the token account (wrapped SOL remains spendable as WSOL), and the
   * root owner can close the account later. Accounts created inside this same transaction
   * are not snapshotted — their closes are kept.
   */
  private async dropClosesOfPreexistingWalletTokenAccounts(
    instructions: TransactionInstruction[],
    walletAddress: PublicKey,
  ): Promise<TransactionInstruction[]> {
    // Lazy import: the logger pulls in the config manager, and this module must stay
    // loadable without Gateway's config (mirrors the SDK lazy-load in swig-service).
    const { logger } = await import('../../services/logger');
    const result: TransactionInstruction[] = [];
    for (const ix of instructions) {
      if (await this.isCloseOfPreexistingWalletTokenAccount(ix, walletAddress)) {
        logger.warn(
          `Dropping CloseAccount of ${ix.keys[0].pubkey.toBase58()} from the Swig transaction: closing a ` +
            'token account the wallet owned before the transaction crashes the deployed Swig program. The ' +
            'balance stays in the token account (wrapped SOL remains spendable as WSOL).',
        );
        continue;
      }
      result.push(ix);
    }
    return result;
  }

  private async isCloseOfPreexistingWalletTokenAccount(
    ix: TransactionInstruction,
    walletAddress: PublicKey,
  ): Promise<boolean> {
    const isTokenProgram = ix.programId.equals(TOKEN_PROGRAM_ID) || ix.programId.equals(TOKEN_2022_PROGRAM_ID);
    // CloseAccount is discriminator 9 with no payload in both token programs; accounts are
    // [account, destination, authority, ...multisig signers].
    if (!isTokenProgram || ix.data.length !== 1 || ix.data[0] !== 9 || ix.keys.length < 3) {
      return false;
    }
    if (!ix.keys[2].pubkey.equals(walletAddress)) {
      return false;
    }
    const info = await this.connection.getAccountInfo(ix.keys[0].pubkey);
    return info !== null;
  }

  /**
   * Reduce a transaction to a flat instruction list plus any lookup tables it used.
   * Legacy transactions have no lookup tables; versioned transactions are decompiled
   * against their resolved Address Lookup Table accounts.
   */
  private async decompose(
    tx: Transaction | VersionedTransaction,
  ): Promise<{ instructions: TransactionInstruction[]; lookupTables: AddressLookupTableAccount[] }> {
    if (tx instanceof VersionedTransaction) {
      const lookupTables = await this.resolveLookupTables(tx);
      const decompiled = TransactionMessage.decompile(tx.message, {
        addressLookupTableAccounts: lookupTables,
      });
      return { instructions: decompiled.instructions, lookupTables };
    }
    return { instructions: tx.instructions, lookupTables: [] };
  }

  private async resolveLookupTables(tx: VersionedTransaction): Promise<AddressLookupTableAccount[]> {
    const lookups = tx.message.addressTableLookups ?? [];
    if (lookups.length === 0) {
      return [];
    }
    const accounts = await Promise.all(
      lookups.map(async (lookup) => {
        const res = await this.connection.getAddressLookupTable(lookup.accountKey);
        if (!res.value) {
          throw new Error(`Address lookup table not found: ${lookup.accountKey.toBase58()}`);
        }
        return res.value;
      }),
    );
    return accounts;
  }
}

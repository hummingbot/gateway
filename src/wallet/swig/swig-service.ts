/**
 * Swig Service
 * Wraps the @swig-wallet/classic SDK for the Swig smart-contract wallet on Solana.
 *
 * A Swig wallet is a program-derived account (PDA) under the single Swig program
 * (already deployed on mainnet: swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB). It has
 * no private key. To act as the wallet, an authority key signs a transaction whose
 * inner instructions are WRAPPED by the Swig `sign` instruction; the Swig program then
 * checks the authority's role permissions and executes the inner instructions via CPI,
 * signing as the PDA.
 *
 * Gateway holds a restricted "delegate" authority (a normal keystore keypair). The
 * owner/root authority stays offline and is only used by the provisioning script.
 */

import { randomBytes } from 'crypto';

import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
// Type-only import: the SDK is loaded lazily in getSdk() (its package main is a CJS
// build, but it pulls ESM-only transitive deps that must not load unless Swig is used).
import type { Swig, Role, Actions } from '@swig-wallet/classic';

type SwigSdk = typeof import('@swig-wallet/classic');

export interface SwigTokenLimit {
  /** Mint address of the token. */
  mint: string;
  /** Raw base-unit amount the delegate may spend of this mint (one-time cap). */
  amount: bigint;
}

export interface SwigRoleRestrictions {
  /**
   * Programs the delegate role may invoke. A DEX swap CPIs into several programs
   * (e.g. the Orca Whirlpools program AND the SPL Token program), so every program the
   * wrapped instructions touch must be listed here, or the Swig program rejects the sign.
   */
  allowedProgramIds: string[];
  /**
   * Grant ProgramAll (any program) instead of a per-program allowlist — the
   * "token-cap-only" role an aggregator like Jupiter needs, since it routes through
   * arbitrary programs that vary per quote. The blast radius stays bounded by the
   * token/SOL caps: without a cap for a mint the delegate cannot spend it at all.
   * Mutually exclusive with allowedProgramIds.
   */
  allowAllPrograms?: boolean;
  /** Per-mint one-time spend caps enforced on-chain across CPIs. */
  tokenLimits: SwigTokenLimit[];
  /**
   * One-time SOL spend cap in lamports. Needed for any wallet-paid lamport debit (ATA
   * rent, native-SOL wraps); without it such swaps fail post-execution with 0xbbe.
   */
  solLimitLamports?: bigint;
}

export interface CreateSwigInstructionParams {
  /** Account that funds and signs wallet creation (the owner). */
  payer: PublicKey;
  /** Owner/root authority public key (kept offline). */
  ownerPublicKey: PublicKey;
}

export interface BuildCreateResult {
  /** 32-byte Swig id (store it; needed to re-derive the account address). */
  id: Uint8Array;
  /** The Swig account (PDA) address. */
  accountAddress: PublicKey;
  /** Instruction that creates the Swig with the owner as root authority. */
  createInstruction: TransactionInstruction;
}

export class SwigService {
  private sdk: SwigSdk | null = null;

  private getSdk(): SwigSdk {
    if (!this.sdk) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.sdk = require('@swig-wallet/classic') as SwigSdk;
    }
    return this.sdk;
  }

  /** The deployed Swig program address. */
  get programId(): PublicKey {
    return this.getSdk().SWIG_PROGRAM_ADDRESS;
  }

  /**
   * Build the actions for a restricted delegate role: only the allowlisted programs,
   * with a one-time spend cap per mint. The delegate can do nothing else.
   */
  private buildDelegateActions(restrictions: SwigRoleRestrictions): Actions {
    const { Actions } = this.getSdk();
    if (restrictions.allowAllPrograms && restrictions.allowedProgramIds.length > 0) {
      throw new Error('allowAllPrograms and allowedProgramIds are mutually exclusive');
    }
    if (!restrictions.allowAllPrograms && restrictions.allowedProgramIds.length === 0) {
      throw new Error('Swig delegate role requires at least one allowed program id (or allowAllPrograms)');
    }
    let builder = Actions.set();
    if (restrictions.allowAllPrograms) {
      builder = builder.programAll();
    }
    for (const programId of restrictions.allowedProgramIds) {
      builder = builder.programLimit({ programId });
    }
    for (const limit of restrictions.tokenLimits) {
      builder = builder.tokenLimit({ mint: limit.mint, amount: limit.amount });
    }
    if (restrictions.solLimitLamports && restrictions.solLimitLamports > 0n) {
      builder = builder.solLimit({ amount: restrictions.solLimitLamports });
    }
    return builder.get();
  }

  /**
   * Build the instruction that creates a new Swig wallet whose root authority is the
   * owner key (full permissions). The delegate role is added in a second step
   * (buildAddDelegateInstructions) after the account exists on-chain.
   */
  async buildCreateInstruction(params: CreateSwigInstructionParams): Promise<BuildCreateResult> {
    const sdk = this.getSdk();
    const id = Uint8Array.from(randomBytes(32));
    const accountAddress = sdk.findSwigPda(id);
    const rootActions = sdk.Actions.set().all().get();
    const createInstruction = await sdk.getCreateSwigInstruction({
      payer: params.payer,
      id,
      actions: rootActions,
      authorityInfo: sdk.createEd25519AuthorityInfo(params.ownerPublicKey),
    });
    return { id, accountAddress, createInstruction };
  }

  /**
   * Build the instructions that add the restricted delegate role to an existing Swig,
   * authorized by the owner (root). The returned instructions must be signed by the owner.
   */
  async buildAddDelegateInstructions(
    connection: Connection,
    accountAddress: PublicKey,
    ownerPublicKey: PublicKey,
    delegatePublicKey: PublicKey,
    restrictions: SwigRoleRestrictions,
  ): Promise<TransactionInstruction[]> {
    const sdk = this.getSdk();
    const swig = await sdk.fetchSwig(connection, accountAddress);
    const rootRole = this.requireRole(swig, ownerPublicKey, 'owner/root');
    const actions = this.buildDelegateActions(restrictions);
    return sdk.getAddAuthorityInstructions(
      swig,
      rootRole.id,
      sdk.createEd25519AuthorityInfo(delegatePublicKey),
      actions,
      { payer: ownerPublicKey },
    );
  }

  /**
   * Build instructions that ADD per-mint spend caps to an existing delegate role (e.g.
   * enabling a new token for trading). This is an admin action authorized by the owner
   * (root) authority — the owner key signs the returned instructions.
   */
  async buildAddTokenLimitsInstructions(
    connection: Connection,
    accountAddress: PublicKey,
    ownerPublicKey: PublicKey,
    delegatePublicKey: PublicKey,
    tokenLimits: SwigTokenLimit[],
  ): Promise<TransactionInstruction[]> {
    const sdk = this.getSdk();
    if (tokenLimits.length === 0) {
      throw new Error('No token limits provided');
    }
    const swig = await sdk.fetchSwig(connection, accountAddress);
    const rootRole = this.requireRole(swig, ownerPublicKey, 'owner/root');
    const delegateRole = this.requireRole(swig, delegatePublicKey, 'delegate');
    let builder = sdk.Actions.set();
    for (const limit of tokenLimits) {
      builder = builder.tokenLimit({ mint: limit.mint, amount: limit.amount });
    }
    const update = sdk.updateAuthorityAddActions(builder.get());
    return sdk.getUpdateAuthorityInstructions(swig, rootRole.id, delegateRole.id, update, {
      payer: ownerPublicKey,
    });
  }

  /**
   * Build instructions that ADD a one-time SOL spend cap to an existing delegate role.
   * A delegate needs this for any wallet-paid lamport debit: ATA rent when a swap creates
   * the wallet's token account, and native-SOL wraps — without it the Swig program rejects
   * the sign with PermissionDeniedMissingPermission (0xbbe) even though the swap itself
   * succeeded. Owner-signed admin action.
   */
  async buildAddSolLimitInstructions(
    connection: Connection,
    accountAddress: PublicKey,
    ownerPublicKey: PublicKey,
    delegatePublicKey: PublicKey,
    lamports: bigint,
  ): Promise<TransactionInstruction[]> {
    const sdk = this.getSdk();
    if (lamports <= 0n) {
      throw new Error('SOL limit must be positive');
    }
    const swig = await sdk.fetchSwig(connection, accountAddress);
    const rootRole = this.requireRole(swig, ownerPublicKey, 'owner/root');
    const delegateRole = this.requireRole(swig, delegatePublicKey, 'delegate');
    const update = sdk.updateAuthorityAddActions(sdk.Actions.set().solLimit({ amount: lamports }).get());
    return sdk.getUpdateAuthorityInstructions(swig, rootRole.id, delegateRole.id, update, {
      payer: ownerPublicKey,
    });
  }

  /**
   * Build instructions that ADD programs to an existing delegate role's allowlist (e.g.
   * enabling a new trading venue). Owner-signed admin action, same shape as
   * buildAddTokenLimitsInstructions.
   */
  async buildAddProgramLimitsInstructions(
    connection: Connection,
    accountAddress: PublicKey,
    ownerPublicKey: PublicKey,
    delegatePublicKey: PublicKey,
    programIds: string[],
  ): Promise<TransactionInstruction[]> {
    const sdk = this.getSdk();
    if (programIds.length === 0) {
      throw new Error('No program ids provided');
    }
    const swig = await sdk.fetchSwig(connection, accountAddress);
    const rootRole = this.requireRole(swig, ownerPublicKey, 'owner/root');
    const delegateRole = this.requireRole(swig, delegatePublicKey, 'delegate');
    let builder = sdk.Actions.set();
    for (const programId of programIds) {
      builder = builder.programLimit({ programId });
    }
    const update = sdk.updateAuthorityAddActions(builder.get());
    return sdk.getUpdateAuthorityInstructions(swig, rootRole.id, delegateRole.id, update, {
      payer: ownerPublicKey,
    });
  }

  /**
   * Build instructions that REMOVE a delegate role from the Swig entirely — the kill
   * switch for a compromised or retired delegate key. Owner-signed admin action.
   */
  async buildRemoveDelegateInstructions(
    connection: Connection,
    accountAddress: PublicKey,
    ownerPublicKey: PublicKey,
    delegatePublicKey: PublicKey,
  ): Promise<TransactionInstruction[]> {
    const sdk = this.getSdk();
    const swig = await sdk.fetchSwig(connection, accountAddress);
    const rootRole = this.requireRole(swig, ownerPublicKey, 'owner/root');
    const delegateRole = this.requireRole(swig, delegatePublicKey, 'delegate');
    return sdk.getRemoveAuthorityInstructions(swig, rootRole.id, delegateRole.id, {
      payer: ownerPublicKey,
    });
  }

  /** Fetch the on-chain Swig account. Throws if the account does not exist. */
  async fetchSwig(connection: Connection, accountAddress: PublicKey): Promise<Swig> {
    return this.getSdk().fetchSwig(connection, accountAddress);
  }

  /**
   * The funds-owner address: the account that owns the wallet's token accounts and is
   * referenced as the authority inside inner instructions. This is the address Gateway
   * treats as "the wallet" and hands to connectors so they derive the right ATAs.
   */
  async getWalletAddress(swig: Swig): Promise<PublicKey> {
    return this.getSdk().getSwigWalletAddress(swig);
  }

  /**
   * Wrap inner instructions in the Swig `sign` instruction for the delegate's role.
   * The returned instructions are placed in a transaction signed (outer) by the
   * delegate keypair; the Swig program executes the inner instructions via CPI.
   */
  async wrapInstructions(
    swig: Swig,
    delegatePublicKey: PublicKey,
    innerInstructions: TransactionInstruction[],
  ): Promise<TransactionInstruction[]> {
    const sdk = this.getSdk();
    const role = this.requireRole(swig, delegatePublicKey, 'delegate');
    return sdk.getSignInstructions(swig, role.id, innerInstructions);
  }

  /** Find a role by its Ed25519 signer pubkey, or throw a clear error. */
  requireRole(swig: Swig, signerPublicKey: PublicKey, label: string): Role {
    const roles = swig.findRolesByEd25519SignerPk(signerPublicKey);
    if (!roles || roles.length === 0) {
      throw new Error(`No ${label} role found on Swig for signer ${signerPublicKey.toBase58()}`);
    }
    return roles[0];
  }
}

// Singleton instance
let swigServiceInstance: SwigService | null = null;

export function getSwigService(): SwigService {
  if (!swigServiceInstance) {
    swigServiceInstance = new SwigService();
  }
  return swigServiceInstance;
}

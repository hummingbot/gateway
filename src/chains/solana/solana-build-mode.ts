/**
 * Stateless build mode for Solana transactions (hummingbot/gateway#682).
 *
 * A build route runs a connector's code for the operation inside
 * `captureUnsignedTransaction`. Every Solana connector funnels its finished, unsigned
 * transaction through the wallet-type chokepoint `Solana.sendAndConfirmTransactionForWallet`;
 * when build mode is active the chokepoint prepares the transaction exactly as it would for
 * an external (hardware) signer — simulate, compute budget, fresh blockhash, partial-sign
 * ephemeral keypairs, fee-payer slot left empty — and then, instead of signing and
 * broadcasting, throws `UnsignedTransactionCaptured` carrying the serialized transaction.
 * The wrapper catches it and hands the payload to the route.
 *
 * Abort-by-throw is deliberate: connector code after the chokepoint reads the confirmed
 * transaction (balance changes, rent, fees), none of which exists for a build. A connector
 * whose operation spans several sequential transactions is captured at its FIRST
 * transaction — the caller signs and submits it, then calls build again for the next one.
 *
 * The context also carries caller-supplied extra instructions (e.g. a client program's
 * own registration), appended to the transaction BEFORE simulation and the ephemeral
 * partial-signatures, so the signed message already contains them — appending after the
 * fact would invalidate the ephemeral signatures.
 */
import { AsyncLocalStorage } from 'async_hooks';

import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { httpErrors } from '../../services/error-handler';

import { TransactionPriority } from './solana-priority-fees';

/** Wire shape of a caller-supplied instruction (all byte fields base64). */
export interface BuildExtraInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}

/** An instruction as `format: "instructions"` returns it (all byte fields base64). */
export interface WireInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}

/** What a build route returns: the prepared, partially-signed transaction. */
export interface BuiltUnsignedTransaction {
  /** Base64-serialized transaction. Ephemeral signers already signed; the fee-payer slot is empty.
   *  Absent with `format: "instructions"`. */
  transaction?: string;
  /** The wallet that must sign the fee-payer slot. */
  feePayer: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  /** Block height at build time, so clients can render an expiry countdown without their own RPC call. */
  currentBlockHeight: number;
  /** Ephemeral signatures already applied (base64), returned so /chains/solana/submit can re-merge them. */
  extraSigners: { pubkey: string; signature: string }[];
  /** `format: "instructions"`: the operation's instructions, compute-budget ones excluded. */
  instructions?: WireInstruction[];
  /** `format: "instructions"`: lookup tables the operation's instructions were compiled against. */
  addressLookupTableAddresses?: string[];
  /** `format: "instructions"`: the compute limit and price the transaction would have carried. */
  computeUnits?: number;
  computeUnitPriceMicroLamports?: number;
  /** `format: "instructions"`: the ephemeral keypairs the instructions need, secret keys base58. */
  ephemeralSigners?: { pubkey: string; secretKey: string }[];
}

/** The caller's shaping of a build, beside the operation itself. */
export interface BuildShape {
  extraInstructions?: BuildExtraInstruction[];
  /** Who pays the transaction fee and signs its first slot; the wallet when absent. */
  feePayer?: string;
  /** `transaction` (default): a compiled, partially-signed transaction. `instructions`: the raw
   *  instructions for a caller that wraps them (a smart wallet's execute instruction). */
  format?: 'transaction' | 'instructions';
  /** A signer-less SPL Memo appended to the transaction (e.g. `app:ref=<id>`). */
  memo?: string;
  /** Solana Pay references: read-only, non-signer accounts a transaction can be found by. */
  references?: string[];
}

/** SPL Memo v2. With no accounts, a memo requires no signature. */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
/** A memo is metadata, not a message: capped well under the transaction's size budget. */
export const MAX_MEMO_BYTES = 128;

/** The signer-less memo instruction, refused when empty or over MAX_MEMO_BYTES. */
export function memoInstruction(memo: string): TransactionInstruction {
  const data = Buffer.from(memo, 'utf8');
  if (data.length === 0) throw httpErrors.badRequest('memo is empty');
  if (data.length > MAX_MEMO_BYTES) {
    throw httpErrors.badRequest(`memo is ${data.length} bytes; at most ${MAX_MEMO_BYTES}`);
  }
  return new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data });
}

/** How many references a build may carry: each is 32 bytes of the transaction. */
export const MAX_REFERENCES = 3;

/** `references` as distinct addresses, or a 400 naming what is wrong. */
export function parseReferences(references: string[] | undefined): PublicKey[] {
  if (!references || references.length === 0) return [];
  if (references.length > MAX_REFERENCES) {
    throw httpErrors.badRequest(`references has ${references.length} entries; at most ${MAX_REFERENCES}`);
  }
  const keys = references.map((r) => {
    try {
      return new PublicKey(r);
    } catch {
      throw httpErrors.badRequest(`A reference is not a Solana address: ${r}`);
    }
  });
  if (new Set(keys.map((k) => k.toBase58())).size !== keys.length) {
    throw httpErrors.badRequest('references repeats an address');
  }
  return keys;
}

/**
 * Where Solana Pay references ride: a 0-lamport System transfer from the fee payer to
 * itself, with each reference appended as a read-only, non-signer account. The System
 * program's transfer ignores accounts past its two, so the references change nothing but
 * make the transaction findable by getSignaturesForAddress(reference) — on any venue,
 * without depending on whether that venue's instructions tolerate extra accounts. The
 * payer already signs, so it adds no signature.
 */
export function referenceInstruction(payer: PublicKey, references: PublicKey[]): TransactionInstruction {
  const transfer = SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 });
  return new TransactionInstruction({
    programId: transfer.programId,
    data: transfer.data,
    keys: [...transfer.keys, ...references.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }))],
  });
}

/**
 * Control-flow sentinel thrown by the chokepoint when build mode is active. Never
 * reaches a caller: `captureUnsignedTransaction` converts it into a return value.
 */
export class UnsignedTransactionCaptured extends Error {
  constructor(public readonly built: BuiltUnsignedTransaction) {
    super('Unsigned transaction captured for external signing');
  }
}

/**
 * Gateway's own instructions for a build — a platform fee — as opposed to the
 * caller's wire `extraInstructions`. `prepend` lands at the front of the message
 * (an account the operation needs to exist, such as a fee account a router pays
 * into); `append` after the operation's own and the caller's.
 */
export interface PlatformInstructions {
  prepend: TransactionInstruction[];
  append: TransactionInstruction[];
}

export interface BuildModeContext {
  extraInstructions: TransactionInstruction[];
  /** The fee payer when it is not the wallet. */
  feePayer?: PublicKey;
  /** Return raw instructions instead of a compiled transaction. */
  format: 'transaction' | 'instructions';
  /** Gateway-internal instructions around the operation's own (see PlatformInstructions). */
  prependInstructions: TransactionInstruction[];
  appendInstructions: TransactionInstruction[];
  /**
   * A compute-unit floor for the captured transaction. The build path sizes the
   * compute budget from simulation (× a safety margin); a caller whose instruction
   * lands hotter than it simulates (an instruction that reallocs or rehashes an
   * account can consume more on-chain than in simulation) sets a floor so the budget is
   * never sized below what the instruction actually needs. Undefined = no floor,
   * unchanged behavior for every existing caller.
   */
  minComputeUnits?: number;
  /**
   * How hard the caller wants this transaction to compete for block space. It
   * sets the compute-unit price baked into the captured transaction, and it is
   * baked in for a reason: the message is signed as-is, so the price cannot be
   * raised afterwards — a caller who wants to pay more rebuilds. Undefined =
   * `normal`, the configured level, which is what every existing caller gets.
   */
  priority?: TransactionPriority;
  /**
   * Build without simulating. For a transaction that depends on one the caller
   * sends before it — the state it would run against does not exist yet, so a
   * simulation now fails for a reason the real send will not have. The compute
   * limit is then `minComputeUnits`, which must be set. Undefined = simulate.
   */
  unsimulated?: boolean;
  /** Solana Pay references to attach (see referenceInstruction). */
  references: PublicKey[];
}

const buildModeStorage = new AsyncLocalStorage<BuildModeContext>();

/** The active build context, or undefined when running a normal (custodial) execute. */
export const getBuildModeContext = (): BuildModeContext | undefined => buildModeStorage.getStore();

/** Parse one wire-format instruction, rejecting malformed input as a 400. */
function parseExtraInstruction(ix: BuildExtraInstruction, index: number): TransactionInstruction {
  try {
    return new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((a) => ({
        pubkey: new PublicKey(a.pubkey),
        isSigner: a.isSigner,
        isWritable: a.isWritable,
      })),
      data: Buffer.from(ix.data, 'base64'),
    });
  } catch (e: any) {
    throw httpErrors.badRequest(`extraInstructions[${index}] is malformed: ${e.message}`);
  }
}

/**
 * A caller-supplied extra instruction may not require a signature from anyone but the
 * wallet: the wallet reviews and signs the whole message, but a build route must never
 * produce a transaction that waits on a signer Gateway neither holds nor returns.
 */
function assertOnlyWalletSigns(instructions: TransactionInstruction[], wallet: PublicKey): void {
  for (const ix of instructions) {
    for (const key of ix.keys) {
      if (key.isSigner && !key.pubkey.equals(wallet)) {
        throw httpErrors.badRequest(
          `extraInstructions require a signature from ${key.pubkey.toBase58()}, which is not the wallet. ` +
            'Extra instructions may only name the wallet as a signer.',
        );
      }
    }
  }
}

/**
 * Run a connector's operation in build mode and return the captured transaction.
 *
 * Any error other than the capture sentinel — simulation failure, bad pool, bad params —
 * propagates unchanged, so build surfaces exactly the errors execute would. A connector
 * that completes without ever reaching the chokepoint built nothing (e.g. an operation
 * that turned out to be a no-op); that is reported rather than returned as a phantom
 * transaction.
 */
export async function captureUnsignedTransaction(
  shape: BuildShape,
  run: () => Promise<unknown>,
  minComputeUnits?: number,
  priority?: TransactionPriority,
  unsimulated?: boolean,
  platform?: PlatformInstructions,
): Promise<BuiltUnsignedTransaction> {
  if (unsimulated && !minComputeUnits) {
    throw httpErrors.internalServerError('An unsimulated build needs minComputeUnits for its compute limit');
  }
  const parsed = (shape.extraInstructions ?? []).map(parseExtraInstruction);
  let feePayer: PublicKey | undefined;
  if (shape.feePayer !== undefined) {
    try {
      feePayer = new PublicKey(shape.feePayer);
    } catch {
      throw httpErrors.badRequest(`feePayer is not a Solana address: ${shape.feePayer}`);
    }
  }
  const append = [...(platform?.append ?? []), ...(shape.memo !== undefined ? [memoInstruction(shape.memo)] : [])];
  try {
    await buildModeStorage.run(
      {
        extraInstructions: parsed,
        feePayer,
        format: shape.format ?? 'transaction',
        prependInstructions: platform?.prepend ?? [],
        appendInstructions: append,
        references: parseReferences(shape.references),
        minComputeUnits,
        priority,
        unsimulated,
      },
      run,
    );
  } catch (e) {
    if (e instanceof UnsignedTransactionCaptured) {
      return e.built;
    }
    throw e;
  }
  throw httpErrors.badRequest(
    'The operation completed without building a transaction — there is nothing to sign. ' +
      'This usually means the operation is a no-op in the current state.',
  );
}

/**
 * Insert instructions into a not-yet-signed transaction: `prepend` at the front of
 * the message, `append` at its end.
 *
 * Legacy transactions change in place. Versioned transactions are decompiled (resolving
 * any address lookup tables via the connection), changed, and recompiled — valid only
 * because nothing has signed the message yet: the chokepoint inserts before the
 * ephemeral partial-signatures are made. Only the wallet may sign what is inserted.
 */
export async function insertInstructions(
  tx: Transaction | VersionedTransaction,
  prepend: TransactionInstruction[],
  append: TransactionInstruction[],
  feePayer: PublicKey,
  connection: Connection,
): Promise<Transaction | VersionedTransaction> {
  if (prepend.length === 0 && append.length === 0) return tx;
  assertOnlyWalletSigns([...prepend, ...append], feePayer);

  if (!(tx instanceof VersionedTransaction)) {
    tx.instructions = [...prepend, ...tx.instructions, ...append];
    return tx;
  }

  const { message, lookupTables } = await decompileVersioned(tx, connection);
  message.instructions = [...prepend, ...message.instructions, ...append];
  return new VersionedTransaction(message.compileToV0Message(lookupTables));
}

/** A versioned transaction's message with its lookup tables resolved, for rebuilding. */
export async function decompileVersioned(
  tx: VersionedTransaction,
  connection: Connection,
): Promise<{ message: TransactionMessage; lookupTables: AddressLookupTableAccount[] }> {
  const lookupTables: AddressLookupTableAccount[] = [];
  for (const lookup of tx.message.addressTableLookups) {
    const table = await connection.getAddressLookupTable(lookup.accountKey);
    if (!table.value) {
      throw httpErrors.internalServerError(
        `Address lookup table ${lookup.accountKey.toBase58()} referenced by the transaction was not found on-chain`,
      );
    }
    lookupTables.push(table.value);
  }
  return {
    message: TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: lookupTables }),
    lookupTables,
  };
}

/** Move a not-yet-signed transaction's fee payer to `payer`. */
export async function withFeePayer(
  tx: Transaction | VersionedTransaction,
  payer: PublicKey,
  connection: Connection,
): Promise<Transaction | VersionedTransaction> {
  if (!(tx instanceof VersionedTransaction)) {
    tx.feePayer = payer;
    return tx;
  }
  if (tx.message.staticAccountKeys[0].equals(payer)) return tx;
  const { message, lookupTables } = await decompileVersioned(tx, connection);
  message.payerKey = payer;
  return new VersionedTransaction(message.compileToV0Message(lookupTables));
}

/** The wire form of an instruction (byte fields base64). */
export function toWireInstruction(ix: TransactionInstruction): WireInstruction {
  return {
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map((k) => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })),
    data: Buffer.from(new Uint8Array(ix.data)).toString('base64'),
  };
}

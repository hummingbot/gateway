/**
 * Stateless build mode for EVM transactions (hummingbot/gateway#682, EVM half).
 *
 * Every EVM operation that sends a transaction hands its call — `{to, data, value}` —
 * to one chokepoint, `Ethereum.sendTransactionForWallet`. The chokepoint builds the
 * complete unsigned transaction (chain id, nonce, gas limit from `eth_estimateGas`, fee
 * fields) and then either:
 *
 * - execute: signs it with the wallet's signer and broadcasts it, or
 * - build (inside `captureEvmTransaction`): throws `EvmTransactionCaptured` carrying the
 *   unsigned transaction. The wrapper turns that into the build route's answer. Nothing
 *   is signed or sent, and no key is loaded.
 *
 * So `execute-*` is build + sign + submit and `build-*` is build alone, on one code path.
 *
 * Abort-by-throw is deliberate, as on Solana: connector code after the chokepoint reads
 * the receipt (logs, gas used), none of which exists for a build.
 *
 * Approvals. An operation that needs an ERC-20 allowance checks it with
 * `Ethereum.requireAllowance`. Execute refuses a short allowance with a 400, as it always
 * has. Build instead records the approval transactions the caller must send first, and
 * gives them the next nonces: approvals take nonce n, n+1, ..., and the operation takes
 * the nonce after them. The caller signs every transaction and submits them in order.
 * The operation cannot be simulated before its approvals land (it would revert), so it
 * is built unsimulated with the connector's gas limit, and `simulated` says so.
 */
import { AsyncLocalStorage } from 'async_hooks';

import { httpErrors } from '../../services/error-handler';

/** The call an operation makes. The chokepoint fills in everything else. */
export interface EvmCall {
  to: string;
  data: string;
  /** Native value in wei, as a decimal string or anything BigNumber.from accepts. */
  value?: string;
  /**
   * The gas limit to use when the call cannot be simulated (its approvals have not
   * landed yet). A simulated call takes its limit from `eth_estimateGas` instead.
   */
  gasLimit: number;
  /** What the transaction does, for logs and the approvals list. */
  description: string;
}

/** A complete unsigned EVM transaction: sign it as-is and pass it to /chains/ethereum/submit. */
export interface EvmUnsignedTransaction {
  chainId: number;
  from: string;
  to: string;
  data: string;
  /** Wei, decimal string. */
  value: string;
  nonce: number;
  /** Decimal string. */
  gasLimit: string;
  /** 2 = EIP-1559, 0 = legacy. */
  type: number;
  /** Wei, decimal string (type 2). */
  maxFeePerGas?: string;
  /** Wei, decimal string (type 2). */
  maxPriorityFeePerGas?: string;
  /** Wei, decimal string (type 0). */
  gasPrice?: string;
}

/** An approval the operation needs, as the transaction that grants it. */
export interface EvmApproval {
  /** The token the approval is for. */
  token: string;
  symbol: string;
  /** Who is approved: a router, a position manager, or Permit2. */
  spender: string;
  /** The allowance the operation needs, in token units (decimal string). */
  amount: string;
  /** The allowance the wallet has now, in token units (decimal string). */
  currentAllowance: string;
  transaction: EvmUnsignedTransaction;
}

/** What an EVM build route returns. */
export interface BuiltEvmTransaction {
  /** The operation itself. Its nonce comes after every approval's. */
  unsignedTransaction: EvmUnsignedTransaction;
  /** Transactions to sign and submit first, in order. Empty when no approval is missing. */
  approvals: EvmApproval[];
  /**
   * true: the gas limit came from eth_estimateGas, so the transaction ran against the
   * current chain state. false: an approval it needs has not landed, so it could not be
   * simulated; the gas limit is the connector's fixed limit.
   */
  simulated: boolean;
}

/** One allowance check, recorded in build mode instead of refused. */
export interface PendingApproval {
  token: string;
  symbol: string;
  decimals: number;
  spender: string;
  /** Raw units. */
  required: string;
  /** Raw units. */
  current: string;
  call: EvmCall;
}

export interface EvmBuildContext {
  approvals: PendingApproval[];
}

/**
 * Control-flow sentinel thrown by the chokepoint in build mode. Never reaches a caller:
 * `captureEvmTransaction` converts it into a return value. Connector catch blocks that
 * rewrap errors must rethrow it unchanged (see `rethrowIfCaptured`).
 */
export class EvmTransactionCaptured extends Error {
  constructor(public readonly built: BuiltEvmTransaction) {
    super('Unsigned EVM transaction captured for external signing');
  }
}

/** For a catch block that rewraps errors: let the build sentinel through untouched. */
export function rethrowIfCaptured(error: unknown): void {
  if (error instanceof EvmTransactionCaptured) throw error;
}

const buildStorage = new AsyncLocalStorage<EvmBuildContext>();

/** The active build context, or undefined during a normal execute. */
export const getEvmBuildContext = (): EvmBuildContext | undefined => buildStorage.getStore();

/**
 * Run an operation in build mode and return the transaction it would have sent.
 *
 * Any error other than the sentinel propagates unchanged, so build reports exactly the
 * errors execute would. An operation that finishes without reaching the chokepoint built
 * nothing (it was a no-op in the current state); that is a 400, not an empty answer.
 */
export async function captureEvmTransaction(run: () => Promise<unknown>): Promise<BuiltEvmTransaction> {
  try {
    await buildStorage.run({ approvals: [] }, run);
  } catch (e) {
    if (e instanceof EvmTransactionCaptured) return e.built;
    throw e;
  }
  throw httpErrors.badRequest(
    'The operation completed without building a transaction, so there is nothing to sign. ' +
      'This usually means the operation is a no-op in the current state.',
  );
}

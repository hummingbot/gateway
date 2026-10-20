/**
 * Shared pieces of the /trading build-* routes (stateless signing, #682).
 *
 * A build route runs the connector's code for the operation and stops at the signing
 * chokepoint (this Gateway holds no key): the response is the prepared,
 * partially-signed transaction for the caller's own signer (a browser wallet, an
 * external bot) to sign and hand to POST /chains/{chain}/submit.
 */
import { Type } from '@sinclair/typebox';

import { captureEvmTransaction } from '../chains/ethereum/evm-build-mode';
import {
  BuildShape,
  BuiltUnsignedTransaction,
  captureUnsignedTransaction,
  MAX_MEMO_BYTES,
  MAX_REFERENCES,
  PlatformInstructions,
} from '../chains/solana/solana-build-mode';
import { TransactionPriority } from '../chains/solana/solana-priority-fees';
import { BuildInstruction, ChainBuildTransactionResponseType } from '../schemas/build-schema';
import { httpErrors } from '../services/error-handler';

/**
 * Reject build requests the capture machinery cannot serve: a chain without a build
 * path, or a connector that signs outside its chain's chokepoint.
 */
export function assertBuildSupported(connector: string, chain: string): void {
  if (chain !== 'solana' && chain !== 'ethereum') {
    throw httpErrors.badRequest(`Build endpoints do not support ${chain}; '${connector}' runs on it.`);
  }
}

/**
 * The build fields that shape a Solana transaction. An EVM transaction has no
 * instructions, fee-payer slot, memo program, references or compute-unit price, and no
 * EVM connector takes a platform fee, so an EVM build refuses each one by name rather
 * than ignoring it.
 */
export interface SolanaBuildFields {
  extraInstructions?: unknown;
  feePayer?: unknown;
  format?: unknown;
  memo?: unknown;
  references?: unknown;
  priority?: unknown;
  platformFee?: unknown;
}

/** Refuse the Solana-only build fields on an EVM build. Call before any fee or chain work. */
export function assertBuildFields(chain: string, fields: SolanaBuildFields): void {
  if (chain === 'solana') return;
  const given = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
  if (given.length > 0) {
    throw httpErrors.badRequest(
      `${given.join(', ')} ${given.length === 1 ? 'applies' : 'apply'} to Solana builds only; ` +
        `a ${chain} build takes none of them.`,
    );
  }
}

/**
 * Run a connector's operation in build mode: assert the connector is buildable, then
 * capture the transaction it would have signed, at its chain's signing chokepoint.
 */
export async function buildUnsigned(
  chain: 'solana',
  connector: string,
  shape: BuildShape,
  run: () => Promise<unknown>,
  priority?: TransactionPriority,
  platform?: PlatformInstructions,
): Promise<BuiltUnsignedTransaction>;
export async function buildUnsigned(
  chain: string,
  connector: string,
  shape: BuildShape,
  run: () => Promise<unknown>,
  priority?: TransactionPriority,
  platform?: PlatformInstructions,
): Promise<ChainBuildTransactionResponseType>;
export async function buildUnsigned(
  chain: string,
  connector: string,
  shape: BuildShape,
  run: () => Promise<unknown>,
  priority?: TransactionPriority,
  platform?: PlatformInstructions,
): Promise<ChainBuildTransactionResponseType> {
  assertBuildSupported(connector, chain);
  if (chain === 'ethereum') {
    assertBuildFields(chain, { ...shape, priority, platformFee: platform });
    return captureEvmTransaction(run);
  }
  return captureUnsignedTransaction(shape, run, undefined, priority, undefined, platform);
}

/**
 * The build-shaping fields every build route takes beside extraInstructions and
 * priority: who pays, what comes back, a memo and references. Spread into a route's body.
 */
export const buildShapeFields = () => ({
  feePayer: Type.Optional(
    Type.String({
      description:
        'Who pays the transaction fee and signs its first slot (base58), when it is not walletAddress. The ' +
        'wallet still signs as the owner of what the operation moves. Default: walletAddress.',
    }),
  ),
  format: Type.Optional(
    Type.Union([Type.Literal('transaction'), Type.Literal('instructions')], {
      description:
        'transaction (default): a compiled transaction, ephemeral keypairs partial-signed. instructions: the ' +
        "operation's raw instructions, lookup-table addresses, compute budget and the ephemeral keypairs, for " +
        "a caller that wraps them (a smart wallet's execute instruction) and compiles its own transaction.",
    }),
  ),
  references: Type.Optional(
    Type.Array(Type.String(), {
      maxItems: MAX_REFERENCES,
      description:
        `Up to ${MAX_REFERENCES} Solana Pay references (base58): read-only, non-signer accounts attached to the ` +
        'transaction (on a 0-lamport self-transfer by the fee payer), so it can be found with ' +
        'getSignaturesForAddress(reference) once it lands.',
    }),
  ),
  memo: Type.Optional(
    Type.String({
      maxLength: MAX_MEMO_BYTES,
      description:
        `A signer-less SPL Memo appended to the transaction (at most ${MAX_MEMO_BYTES} bytes), e.g. ` +
        '"app:ref=<id>" to attribute a transaction on chain.',
    }),
  ),
});

/**
 * How hard the built transaction should compete for block space. It is baked into
 * the message, which the caller signs as-is, so it cannot be raised afterwards:
 * a transaction that is not landing is rebuilt at a higher priority, not patched.
 */
export const priorityField = () =>
  Type.Optional(
    Type.Union([Type.Literal('normal'), Type.Literal('high'), Type.Literal('urgent')], {
      description:
        'Compute-unit price baked into the built transaction: normal (the configured level), high, or urgent. ' +
        "Raises what the transaction pays to land, up to the network's configured maximum — where that ceiling " +
        'is low, high and urgent can cost the same. It cannot make an invalid transaction valid. Default: normal.',
    }),
  );

/** Caller-supplied instructions appended to the built transaction (e.g. LP-reward registration). */
export const extraInstructionsField = () =>
  Type.Optional(
    Type.Array(BuildInstruction, {
      description:
        'Instructions appended to the transaction after the operation’s own, before the ephemeral ' +
        'keypairs partial-sign — so they are covered by every signature. Only the wallet may be named ' +
        'as a signer. Account addresses are literal: an instruction cannot reference an account the ' +
        'build itself creates (e.g. a position keypair generated during build-open), because the caller ' +
        'cannot know that address before the response. Compose atomically only when every account is ' +
        'known pre-build; otherwise follow up with /chains/{chain}/build-transaction after the first ' +
        'transaction confirms, reading the new address from extraSigners.',
    }),
  );

// The response shape lives in schemas/build-schema (it is shared with
// /chains/{chain}/build-transaction); re-exported here for the build-* route files.
export {
  BuildTransactionResponse,
  BuildTransactionResponseType,
  ChainBuildTransactionResponse,
  ChainBuildTransactionResponseType,
  EvmBuildTransactionResponse,
} from '../schemas/build-schema';

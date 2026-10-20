/**
 * Shared shapes of the stateless build/sign/submit flow (#682): the instruction wire
 * format callers hand in, and the unsigned-transaction payload every build route —
 * /trading build-* and /chains/{chain}/build-transaction — answers with.
 */
import { Static, Type } from '@sinclair/typebox';

/**
 * One Solana instruction in wire form (all byte fields base64).
 *
 * Deliberately no $id: this shape only ever appears nested inside request bodies, and a
 * nested $id inside a request schema breaks Fastify's validation-schema resolution (the
 * registered spec component carries an OpenAPI-style $ref the validator cannot follow).
 */
export const BuildInstruction = Type.Object({
  programId: Type.String({ description: 'Program to invoke (base58 address)' }),
  accounts: Type.Array(
    Type.Object({
      pubkey: Type.String({ description: 'Account address (base58)' }),
      isSigner: Type.Boolean(),
      isWritable: Type.Boolean(),
    }),
  ),
  data: Type.String({ description: 'Instruction data, base64-encoded' }),
});
export type BuildInstructionType = Static<typeof BuildInstruction>;

/**
 * The build contract, mirrored by POST /chains/{chain}/submit:
 *
 * 1. Deserialize `transaction` and have the wallet sign the fee-payer slot AS-IS. Do not
 *    add instructions, touch the blockhash, or re-serialize through code that might
 *    normalize the message — any mutation invalidates `extraSigners`' signatures (use
 *    a wallet's signTransaction, not signAndSendTransaction, which may inject
 *    priority-fee instructions).
 * 2. POST the signed transaction to /chains/{chain}/submit together with `extraSigners`;
 *    submit re-merges those signatures before broadcasting and fails with a clear error
 *    if the message was mutated.
 * 3. The blockhash is valid to `lastValidBlockHeight` (~60-90s). If signing takes longer
 *    (a person deliberating in a wallet popup), call build again for a fresh transaction.
 *
 * An operation that spans several sequential transactions returns its FIRST transaction;
 * submit it, then call build again for the next one until the operation reports there is
 * nothing left to sign.
 */
export const BuildTransactionResponse = Type.Object(
  {
    transaction: Type.Optional(
      Type.String({
        description:
          'Base64-serialized transaction, ready for the wallet to sign. Ephemeral keypairs (e.g. a position ' +
          'NFT mint) have already partial-signed; the fee-payer slot is empty. Sign it AS-IS — any mutation ' +
          'invalidates the ephemeral signatures. Absent with format "instructions".',
      }),
    ),
    feePayer: Type.String({
      description:
        'Who must sign the fee-payer slot (base58): walletAddress, or the feePayer the request named. With a ' +
        'separate fee payer the wallet signs too, as the owner of what the operation moves.',
    }),
    recentBlockhash: Type.String({ description: 'Blockhash embedded in the transaction' }),
    lastValidBlockHeight: Type.Number({
      description:
        'The transaction is valid until this block height (~60-90s). Signing after expiry fails at submit; ' +
        'call build again for a fresh transaction.',
    }),
    currentBlockHeight: Type.Number({
      description:
        'Block height when the transaction was built, fetched alongside the blockhash — so a client can ' +
        'render an expiry countdown ((lastValidBlockHeight − currentBlockHeight) blocks, ~0.4s each) ' +
        'without an RPC call of its own.',
    }),
    extraSigners: Type.Array(
      Type.Object({
        pubkey: Type.String({ description: 'Ephemeral signer address (base58)' }),
        signature: Type.String({ description: 'Its signature over the message, base64' }),
      }),
      {
        description:
          'Ephemeral signatures already applied to the transaction. Pass these to /chains/{chain}/submit ' +
          'so it can re-merge them in case the signer did not preserve them. For a position open, the ' +
          'position account / NFT mint address is among these pubkeys. The keypairs themselves are ' +
          'discarded after the build — Gateway stores nothing.',
      },
    ),
    instructions: Type.Optional(
      Type.Array(BuildInstruction, {
        description:
          'format "instructions": the operation\'s instructions, in order, compute-budget ones excluded. ' +
          'The caller compiles its own transaction around them.',
      }),
    ),
    addressLookupTableAddresses: Type.Optional(
      Type.Array(Type.String(), {
        description: 'format "instructions": lookup tables the instructions were compiled against (base58)',
      }),
    ),
    computeUnits: Type.Optional(
      Type.Integer({ description: 'format "instructions": the compute limit the transaction would have set' }),
    ),
    computeUnitPriceMicroLamports: Type.Optional(
      Type.Integer({ description: 'format "instructions": the compute-unit price, in micro-lamports' }),
    ),
    ephemeralSigners: Type.Optional(
      Type.Array(
        Type.Object({
          pubkey: Type.String({ description: 'Ephemeral signer address (base58)' }),
          secretKey: Type.String({ description: 'Its secret key, base58' }),
        }),
        {
          description:
            'format "instructions": the keypairs made for this build (a new mint, a position account). ' +
            'Signatures would not survive the caller rebuilding the message, so the keys are handed over; ' +
            'nothing else holds them.',
        },
      ),
    ),
    platformFee: Type.Optional(
      Type.Object(
        {
          bps: Type.Integer({ description: 'the fee asked, in basis points' }),
          amount: Type.String({
            description:
              'the fee the transaction pays, in UI units of mint as a decimal string (rounded down as built)',
          }),
          mint: Type.String({
            description: 'the fee mint (wSOL, So11111111111111111111111111111111111111112, for SOL)',
          }),
          symbol: Type.String({
            description: "the fee mint's symbol in Gateway's token list, or the mint if unlisted",
          }),
        },
        {
          description:
            'The platform fee this transaction carries, echoed when the build was asked for one (platformFee in ' +
            'the request); absent otherwise.',
        },
      ),
    ),
  },
  { $id: 'BuildTransactionResponse' },
);
export type BuildTransactionResponseType = Static<typeof BuildTransactionResponse>;

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
 * An operation that spans several transactions (a wide Meteora position funded in chunks,
 * a DBC migration that makes its locker first, a pump launch with a dev buy and a lookup
 * table made for it) returns them all in one response: the first at the top level, the
 * rest in `followingTransactions`. Sign them together and submit them in order, each
 * after the one before it confirms. A one-transaction build is unchanged: it has no
 * `followingTransactions`.
 */
const builtTransactionFields = {
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
          description: 'the fee the transaction pays, in UI units of mint as a decimal string (rounded down as built)',
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
};

export const BuildTransactionResponse = Type.Object(
  {
    ...builtTransactionFields,
    followingTransactions: Type.Optional(
      Type.Array(Type.Object(builtTransactionFields), {
        description:
          'An operation of several transactions: the ones after this one, in the order they are submitted. ' +
          'Each has its own extraSigners for /chains/{chain}/submit. They were not simulated (they run against ' +
          'state the transactions before them create), so submit each only after the one before it confirms; ' +
          'if one fails, stop. Absent when the operation is one transaction.',
      }),
    ),
  },
  { $id: 'BuildTransactionResponse' },
);
export type BuildTransactionResponseType = Static<typeof BuildTransactionResponse>;

/**
 * One complete unsigned EVM transaction. Sign it as-is (eth-account, ethers, viem: any
 * signer that takes these fields) and pass the signed raw transaction to
 * /chains/ethereum/submit. All amounts are decimal strings in wei.
 */
export const EvmUnsignedTransaction = Type.Object(
  {
    chainId: Type.Integer({ description: 'EIP-155 chain id the transaction is signed for' }),
    from: Type.String({ description: 'The wallet that must sign it' }),
    to: Type.String(),
    data: Type.String({ description: 'Calldata, 0x-hex' }),
    value: Type.String({ description: 'Native value, in wei' }),
    nonce: Type.Integer({
      description:
        "The wallet's nonce. Gateway assigns it at build time from the pending count, so sign and submit " +
        "one build at a time per wallet; a transaction sent from the wallet in between makes this one's nonce stale.",
    }),
    gasLimit: Type.String(),
    type: Type.Integer({ description: '2 = EIP-1559 (maxFeePerGas, maxPriorityFeePerGas), 0 = legacy (gasPrice)' }),
    maxFeePerGas: Type.Optional(Type.String({ description: 'Type 2: wei per gas' })),
    maxPriorityFeePerGas: Type.Optional(Type.String({ description: 'Type 2: wei per gas' })),
    gasPrice: Type.Optional(Type.String({ description: 'Type 0: wei per gas' })),
  },
  { $id: 'EvmUnsignedTransaction' },
);

export const EvmApproval = Type.Object(
  {
    token: Type.String({ description: 'The token the approval is for' }),
    symbol: Type.String(),
    spender: Type.String({ description: 'Who the approval is for: a router, a position manager, or Permit2' }),
    amount: Type.String({ description: 'The allowance the operation needs, in token units' }),
    currentAllowance: Type.String({ description: 'The allowance the wallet has now, in token units' }),
    transaction: EvmUnsignedTransaction,
  },
  { $id: 'EvmApproval' },
);

/**
 * What an EVM build route returns. The flow, mirrored by /chains/ethereum/submit:
 *
 * 1. Sign each of `approvals[].transaction`, in order, then `unsignedTransaction`. Their
 *    nonces are consecutive: the approvals first, the operation last.
 * 2. Submit them to /chains/ethereum/submit in the same order, each after the previous
 *    one confirms.
 * 3. A transaction sent from the wallet between build and submit takes a nonce this build
 *    assigned; build again.
 */
export const EvmBuildTransactionResponse = Type.Object(
  {
    unsignedTransaction: EvmUnsignedTransaction,
    approvals: Type.Array(EvmApproval, {
      description:
        'Approvals the operation needs that the wallet has not granted, as transactions to sign and submit ' +
        'before unsignedTransaction, in order. Empty when every allowance is in place.',
    }),
    simulated: Type.Boolean({
      description:
        'true: the gas limit came from eth_estimateGas against the current state, so the transaction would ' +
        'not revert now. false: an approval it needs has not landed, so it could not be simulated and ' +
        "carries the connector's fixed gas limit.",
    }),
  },
  { $id: 'EvmBuildTransactionResponse' },
);
export type EvmBuildTransactionResponseType = Static<typeof EvmBuildTransactionResponse>;

/** A build route that serves both chains answers with either shape. */
export const ChainBuildTransactionResponse = Type.Union([BuildTransactionResponse, EvmBuildTransactionResponse], {
  $id: 'ChainBuildTransactionResponse',
  description: 'Solana: BuildTransactionResponse. Ethereum and other EVM chains: EvmBuildTransactionResponse.',
});
export type ChainBuildTransactionResponseType = Static<typeof ChainBuildTransactionResponse>;

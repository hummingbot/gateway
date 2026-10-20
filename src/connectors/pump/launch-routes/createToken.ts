import { getBuyTokenAmountFromSolAmount, GLOBAL_PDA, PUMP_FEE_CONFIG_PDA } from '@pump-fun/pump-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { getBuildModeContext } from '../../../chains/solana/solana-build-mode';
import { CreateTokenResponseType } from '../../../schemas/launch-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pump } from '../pump';
import { PumpConfig } from '../pump.config';
import { toRawAmount } from '../pump.utils';

// On-chain limits enforced by the pump program's create instructions.
const MAX_NAME_BYTES = 32;
const MAX_SYMBOL_BYTES = 13;
const MAX_URI_BYTES = 200;

export interface CreateTokenParams {
  name: string;
  symbol: string;
  /** Metadata JSON URI the caller pinned, embedded on-chain as-is. */
  metadataUri: string;
  /** Optional dev buy in SOL, executed atomically with the create. */
  devBuyAmount?: number;
  /** The token's creator when it is not the signing wallet (e.g. a program that collects its creator fees). */
  creator?: string;
  /** The address lookup table a create with a dev buy compiles against, instead of pump.lookupTableAddress. */
  lookupTableAddress?: string;
}

/**
 * The compute limit of a create with a dev buy that follows the lookup table made for it.
 * It cannot be simulated before the table exists; create_v2 + ATA + buy measured
 * ~190k on mainnet (2026-10), so this leaves room for a busier curve account.
 */
export const CREATE_WITH_DEV_BUY_COMPUTE_UNITS = 300_000;

/** Resolved before building: the identity the transaction will mint. */
export interface PreparedLaunch {
  mintKeypair: Keypair;
  metadataUri: string;
}

/**
 * Validate the request against the program's limits and generate the mint
 * keypair. Separate from createToken so the build route can report the mint
 * and metadataUri alongside the unsigned transaction.
 */
export async function prepareCreateToken(params: CreateTokenParams): Promise<PreparedLaunch> {
  if (Buffer.byteLength(params.name, 'utf8') > MAX_NAME_BYTES) {
    throw httpErrors.badRequest(`Token name exceeds the on-chain limit of ${MAX_NAME_BYTES} bytes`);
  }
  if (Buffer.byteLength(params.symbol, 'utf8') > MAX_SYMBOL_BYTES) {
    throw httpErrors.badRequest(`Token symbol exceeds the on-chain limit of ${MAX_SYMBOL_BYTES} bytes`);
  }
  const { metadataUri } = params;
  if (Buffer.byteLength(metadataUri, 'utf8') > MAX_URI_BYTES) {
    throw httpErrors.badRequest(`metadataUri exceeds the on-chain limit of ${MAX_URI_BYTES} bytes`);
  }

  return { mintKeypair: Keypair.generate(), metadataUri };
}

/**
 * Create a pump.fun token (create_v2: Token-2022, 6 decimals, 1B supply on the
 * bonding curve), optionally with an atomic dev buy. The mint keypair signs as
 * an ephemeral signer, so in build mode it surfaces through `extraSigners`.
 */
export async function createToken(
  network: string,
  walletAddress: string,
  params: CreateTokenParams,
  prepared: PreparedLaunch,
): Promise<CreateTokenResponseType> {
  const solana = await Solana.getInstance(network);
  const pump = await Pump.getInstance(network);
  const walletPk = new PublicKey(walletAddress);
  const mint = prepared.mintKeypair.publicKey;
  // create_v2 takes the creator as an argument, not a signer: the wallet pays
  // and does any dev buy, and the fees accrue to whoever is named here.
  let creator: PublicKey;
  try {
    creator = params.creator ? new PublicKey(params.creator) : walletPk;
  } catch {
    throw httpErrors.badRequest(`Invalid creator: ${params.creator}`);
  }

  const [globalAccountInfo, feeConfigAccountInfo] = await solana.connection.getMultipleAccountsInfo([
    GLOBAL_PDA,
    PUMP_FEE_CONFIG_PDA,
  ]);
  if (!globalAccountInfo) {
    throw httpErrors.internalServerError('pump global account not found on this network');
  }
  const global = pump.sdk.decodeGlobal(globalAccountInfo);
  const feeConfig = feeConfigAccountInfo ? pump.sdk.decodeFeeConfig(feeConfigAccountInfo) : null;

  let instructions;
  if (params.devBuyAmount !== undefined && params.devBuyAmount > 0) {
    const lamports = toRawAmount(params.devBuyAmount, 9);
    // Quote the dev buy against a fresh curve (bondingCurve null = the curve
    // this same transaction creates).
    const tokensOut = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: lamports,
      quoteMint: PublicKey.default,
    });
    instructions = await pump.sdk.createV2AndBuyInstructions({
      global,
      mint,
      name: params.name,
      symbol: params.symbol,
      uri: prepared.metadataUri,
      creator,
      user: walletPk,
      amount: tokensOut,
      solAmount: lamports,
      mayhemMode: false,
    });
  } else {
    instructions = [
      await pump.sdk.createV2Instruction({
        mint,
        name: params.name,
        symbol: params.symbol,
        uri: prepared.metadataUri,
        creator,
        user: walletPk,
        mayhemMode: false,
      }),
    ];
  }

  logger.info(`Creating pump.fun token ${params.symbol} (${mint.toBase58()}) for ${walletAddress}`);

  let signature: string;
  if (params.devBuyAmount !== undefined && params.devBuyAmount > 0) {
    // create_v2 + ATA + buy exceed the legacy transaction size limit, so the dev-buy path
    // compiles a v0 message against an address lookup table: the request's, the
    // configured one, or — with neither — one made for this launch in a transaction
    // before it, which keeps the create and the buy atomic.
    const tableAddress = params.lookupTableAddress ?? PumpConfig.config.lookupTableAddress;
    if (tableAddress) {
      const lookupTable = await readLookupTable(solana, tableAddress);
      const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');
      const transaction = new VersionedTransaction(
        new TransactionMessage({ payerKey: walletPk, recentBlockhash: blockhash, instructions }).compileToV0Message([
          lookupTable,
        ]),
      );
      ({ signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [
        prepared.mintKeypair,
      ]));
    } else {
      signature = await createWithNewLookupTable(solana, walletPk, instructions, prepared.mintKeypair);
    }
  } else {
    const transaction = new Transaction().add(...instructions);
    transaction.feePayer = walletPk;
    // Sign + send via the wallet-type-aware chokepoint. The mint keypair rides as an
    // ephemeral extra signer: in build mode it partial-signs and is surfaced in the
    // response's extraSigners, then discarded.
    ({ signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [
      prepared.mintKeypair,
    ]));
  }
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  const base = { signature, mint: mint.toBase58(), metadataUri: prepared.metadataUri };
  if (!txData) {
    return { ...base, status: 0 /* PENDING */ };
  }

  const data: NonNullable<CreateTokenResponseType['data']> = { fee: txData.meta.fee / 1e9 };
  if (params.devBuyAmount !== undefined && params.devBuyAmount > 0) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      mint.toBase58(),
      NATIVE_MINT.toBase58(),
    ]);
    data.tokenAmountBought = Math.abs(balanceChanges[0]);
    data.quoteTokenAmountSpent = Math.abs(balanceChanges[1]);
  }

  logger.info(`Token ${params.symbol} created at ${mint.toBase58()}: ${signature}`);
  return { ...base, status: 1 /* CONFIRMED */, data };
}

/** A lookup table by address, or a 400 naming why it cannot be used. */
async function readLookupTable(solana: Solana, address: string): Promise<AddressLookupTableAccount> {
  let key: PublicKey;
  try {
    key = new PublicKey(address);
  } catch {
    throw httpErrors.badRequest(`lookupTableAddress is not a Solana address: ${address}`);
  }
  const { value } = await solana.connection.getAddressLookupTable(key);
  if (!value) {
    throw httpErrors.badRequest(
      `The lookup table ${address} does not exist on this network (or is not an address lookup table). ` +
        'Name another, or omit lookupTableAddress and unset pump.lookupTableAddress to have one made for this launch.',
    );
  }
  if (!value.isActive()) {
    throw httpErrors.badRequest(`The lookup table ${address} is deactivated`);
  }
  return value;
}

/**
 * A create with a dev buy and no lookup table to compile against: make one for it. The
 * first transaction creates a table, with the wallet its authority, holding every
 * account of the create that is not a signer; the second is the create and buy,
 * compiled against it. A table's addresses are usable from the slot after they are
 * added, so the second goes only after the first confirms. The table stays the
 * wallet's: it can deactivate and close it later for its rent.
 */
async function createWithNewLookupTable(
  solana: Solana,
  wallet: PublicKey,
  instructions: TransactionInstruction[],
  mintKeypair: Keypair,
): Promise<string> {
  const signers = new Set([wallet.toBase58(), mintKeypair.publicKey.toBase58()]);
  const addresses: PublicKey[] = [];
  const seen = new Set<string>();
  for (const ix of instructions) {
    for (const k of [ix.programId, ...ix.keys.map((m) => m.pubkey)]) {
      const b58 = k.toBase58();
      if (signers.has(b58) || seen.has(b58)) continue;
      seen.add(b58);
      addresses.push(k);
    }
  }
  const recentSlot = await solana.connection.getSlot('finalized');
  const [createTable, tableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: wallet,
    payer: wallet,
    recentSlot,
  });
  const extendTable = AddressLookupTableProgram.extendLookupTable({
    lookupTable: tableAddress,
    authority: wallet,
    payer: wallet,
    addresses,
  });
  const tableTx = new Transaction().add(createTable, extendTable);
  tableTx.feePayer = wallet;
  try {
    // Sized with a placeholder blockhash; the send (or the build) sets the real one.
    tableTx.recentBlockhash = PublicKey.default.toBase58();
    tableTx.serialize({ requireAllSignatures: false, verifySignatures: false });
  } catch (e: any) {
    throw httpErrors.badRequest(
      `The create holds ${addresses.length} accounts, too many to put in a lookup table in one transaction ` +
        `(${e.message}). Name a lookupTableAddress that holds pump's accounts.`,
    );
  }

  const table = new AddressLookupTableAccount({
    key: tableAddress,
    state: {
      deactivationSlot: BigInt('18446744073709551615'),
      lastExtendedSlot: recentSlot,
      lastExtendedSlotStartIndex: 0,
      authority: wallet,
      addresses,
    },
  });
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');
  const createTx = new VersionedTransaction(
    new TransactionMessage({ payerKey: wallet, recentBlockhash: blockhash, instructions }).compileToV0Message([table]),
  );
  logger.info(`pump create with a dev buy: lookup table ${tableAddress.toBase58()} made for it first`);

  if (getBuildModeContext()) {
    await solana.captureSequenceForExternalSigner(
      [
        { transaction: tableTx },
        { transaction: createTx, signers: [mintKeypair], computeUnits: CREATE_WITH_DEV_BUY_COMPUTE_UNITS },
      ],
      wallet.toBase58(),
    );
  }
  await solana.sendAndConfirmTransactionForWallet(tableTx, wallet.toBase58());
  // The chokepoint simulates the create, which resolves the table: its addresses are
  // usable from the slot after the one that added them.
  const extendedAt = await solana.connection.getSlot('confirmed');
  for (let i = 0; (await solana.connection.getSlot('confirmed')) <= extendedAt; i++) {
    if (i >= 50) {
      throw httpErrors.internalServerError(
        `The lookup table ${tableAddress.toBase58()} was made, but the chain did not advance past slot ` +
          `${extendedAt} to make it usable. Create again naming it as lookupTableAddress.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const { signature } = await solana.sendAndConfirmTransactionForWallet(createTx, wallet.toBase58(), [mintKeypair]);
  return signature;
}

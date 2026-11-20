import { getBuyTokenAmountFromSolAmount, GLOBAL_PDA, PUMP_FEE_CONFIG_PDA } from '@pump-fun/pump-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair, PublicKey, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
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
}

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

  let transaction: Transaction | VersionedTransaction;
  if (params.devBuyAmount !== undefined && params.devBuyAmount > 0) {
    // create_v2 + ATA + buy exceed the legacy transaction size limit, so the
    // dev-buy path compiles a v0 message against the configured address lookup table.
    if (!PumpConfig.config.lookupTableAddress) {
      throw httpErrors.badRequest(
        'A create with devBuyAmount does not fit in a transaction without an address lookup table, and ' +
          'pump.lookupTableAddress is not set. Set it in conf/connectors/pump.yml, or create without ' +
          'devBuyAmount and then buy through /trading/router.',
      );
    }
    const lookupTableAddress = new PublicKey(PumpConfig.config.lookupTableAddress);
    const { value: lookupTable } = await solana.connection.getAddressLookupTable(lookupTableAddress);
    if (!lookupTable) {
      throw httpErrors.badRequest(
        `The configured pump lookup table ${lookupTableAddress.toBase58()} does not exist on this network, ` +
          'and a create with a dev buy does not fit in a transaction without it. ' +
          'Create without devBuyAmount, then buy through /trading/router.',
      );
    }
    const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');
    transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: walletPk,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message([lookupTable]),
    );
  } else {
    transaction = new Transaction().add(...instructions);
    transaction.feePayer = walletPk;
  }

  // Sign + send via the wallet-type-aware chokepoint. The mint keypair rides as
  // an ephemeral extra signer: in build mode it partial-signs and is surfaced in
  // the response's extraSigners, then discarded.
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [
    prepared.mintKeypair,
  ]);
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

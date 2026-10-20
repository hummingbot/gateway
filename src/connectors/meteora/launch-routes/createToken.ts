import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { CreateTokenResponseType } from '../../../schemas/launch-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDbc } from '../meteora-dbc';
import { MeteoraDbcConfig } from '../meteora-dbc.config';
import { toRawAmount } from '../meteora-dbc.utils';

// The Token-2022 metadata DBC initializes carries the URI as-is; the program caps it
// like Metaplex does.
const MAX_URI_BYTES = 200;

/**
 * The unified create-token body as meteora's launch surface reads it. `metadataUri` is required
 * (DBC has no upload step) and `firstBuySol` is the creator's atomic first buy. The
 * pump-only fields are listed so a caller who sends them gets told, not ignored.
 */
export interface DbcCreateTokenParams {
  name: string;
  symbol: string;
  metadataUri?: string;
  imageUrl?: string;
  devBuyAmount?: number;
  firstBuySol?: number;
  /** Hand the pool to this creator after creating it (e.g. a program that collects its creator fees). */
  creator?: string;
  /** The DBC config to launch from; omitted, the connector's configured `configAddress`. */
  configAddress?: string;
}

/** The config a launch uses: the one it names, else the connector's. */
function launchConfig(dbc: MeteoraDbc, params: DbcCreateTokenParams): PublicKey {
  if (params.configAddress === undefined) return dbc.requireConfigAddress();
  try {
    return new PublicKey(params.configAddress);
  } catch {
    throw httpErrors.badRequest(`configAddress is not a base58 address: ${params.configAddress}`);
  }
}

/** Resolved before building: the identity the transaction will mint and the pool it creates. */
export interface DbcPreparedLaunch {
  mintKeypair: Keypair;
  metadataUri: string;
  poolAddress: string;
}

/**
 * Validate the request against what a DBC launch can take and generate the mint
 * keypair. The pool PDA is derived here (it depends only on the config's quote mint,
 * the mint and the config), so the build route can report it alongside the mint.
 */
export async function prepareCreateToken(network: string, params: DbcCreateTokenParams): Promise<DbcPreparedLaunch> {
  if (params.imageUrl !== undefined) {
    throw httpErrors.badRequest(
      'meteora does not upload metadata: pin the metadata JSON yourself and pass metadataUri instead of imageUrl.',
    );
  }
  if (params.devBuyAmount !== undefined) {
    throw httpErrors.badRequest('devBuyAmount is a pump parameter; meteora takes firstBuySol.');
  }
  if (!params.metadataUri) {
    throw httpErrors.badRequest('metadataUri is required for a meteora launch.');
  }
  if (Buffer.byteLength(params.metadataUri, 'utf8') > MAX_URI_BYTES) {
    throw httpErrors.badRequest(`metadataUri exceeds the on-chain limit of ${MAX_URI_BYTES} bytes`);
  }
  if (params.firstBuySol !== undefined && !(params.firstBuySol >= 0)) {
    throw httpErrors.badRequest('firstBuySol must be a non-negative number');
  }

  const dbc = await MeteoraDbc.getInstance(network);
  const configAddress = launchConfig(dbc, params);
  const mintKeypair = Keypair.generate();
  const poolAddress = await dbc.derivePoolAddress(configAddress, mintKeypair.publicKey);
  return { mintKeypair, metadataUri: params.metadataUri, poolAddress: poolAddress.toBase58() };
}

/**
 * Launch a token on a DBC virtual pool from the configured partner config, with the
 * wallet as creator and payer and an optional atomic first buy. The mint keypair signs
 * as an ephemeral signer (in build mode it surfaces through `extraSigners`), so a
 * rebuild is a new mint — the same discipline as pump.
 */
export async function createToken(
  network: string,
  walletAddress: string,
  params: DbcCreateTokenParams,
  prepared: DbcPreparedLaunch,
): Promise<CreateTokenResponseType> {
  const solana = await Solana.getInstance(network);
  const dbc = await MeteoraDbc.getInstance(network);
  const walletPk = new PublicKey(walletAddress);
  const mint = prepared.mintKeypair.publicKey;
  const configAddress = launchConfig(dbc, params);

  const createPoolParam = {
    name: params.name,
    symbol: params.symbol,
    uri: prepared.metadataUri,
    payer: walletPk,
    poolCreator: walletPk,
    config: configAddress,
    baseMint: mint,
  };

  const firstBuy = params.firstBuySol !== undefined && params.firstBuySol > 0;
  let transaction;
  if (firstBuy) {
    const config = await dbc.getPoolConfig(configAddress);
    const buyAmount = toRawAmount(params.firstBuySol, 9);
    // The pool is created in this same transaction, so the buy executes at the curve's
    // start price; the quote is against that fresh curve, with the configured slippage
    // as the bound the program enforces.
    const quote = dbc.client.pool.getQuoteFromInputAmount({
      config,
      swapBaseForQuote: false,
      amountIn: buyAmount,
      swapMode: SwapMode.ExactIn,
      slippageBps: Math.round(MeteoraDbcConfig.config.slippagePct * 100),
    });
    if (!quote.minimumAmountOut) {
      throw httpErrors.internalServerError('DBC getQuoteFromInputAmount returned no minimumAmountOut');
    }
    if (quote.amountLeft.gt(new BN(0))) {
      throw httpErrors.badRequest(
        `firstBuySol ${params.firstBuySol} exceeds what the curve can absorb before migrating; reduce it.`,
      );
    }
    transaction = await dbc.client.creator.createPoolWithFirstBuy({
      createPoolParam,
      firstBuyParam: {
        buyer: walletPk,
        buyAmount,
        minimumAmountOut: quote.minimumAmountOut,
        referralTokenAccount: null,
      },
    });
  } else {
    transaction = await dbc.client.creator.createPool(createPoolParam);
  }
  // DBC's pool creator must sign the creation, so the wallet creates the pool
  // and hands it over in the same transaction.
  if (params.creator) {
    let newCreator: PublicKey;
    try {
      newCreator = new PublicKey(params.creator);
    } catch {
      throw httpErrors.badRequest(`Invalid creator: ${params.creator}`);
    }
    transaction.add(
      await dbc.transferPoolCreatorInstruction({
        pool: new PublicKey(prepared.poolAddress),
        config: configAddress,
        creator: walletPk,
        newCreator,
      }),
    );
  }
  transaction.feePayer = walletPk;

  logger.info(
    `Creating Meteora DBC pool ${prepared.poolAddress} for ${params.symbol} (${mint.toBase58()}) ` +
      `from config ${configAddress.toBase58()} as ${walletAddress}${firstBuy ? ` with first buy ${params.firstBuySol} SOL` : ''}`,
  );

  // Sign + send via the wallet-type-aware chokepoint. The mint keypair rides as an
  // ephemeral extra signer: in build mode it partial-signs and is surfaced in the
  // response's extraSigners, then discarded.
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [
    prepared.mintKeypair,
  ]);
  const txData = await solana.getConfirmedTransactionData(signature);

  const base = {
    signature,
    mint: mint.toBase58(),
    metadataUri: prepared.metadataUri,
    poolAddress: prepared.poolAddress,
  };
  if (!txData) {
    return { ...base, status: 0 /* PENDING */ };
  }

  const data: NonNullable<CreateTokenResponseType['data']> = { fee: txData.meta.fee / 1e9 };
  if (firstBuy) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      mint.toBase58(),
      NATIVE_MINT.toBase58(),
    ]);
    data.tokenAmountBought = Math.abs(balanceChanges[0]);
    data.quoteTokenAmountSpent = Math.abs(balanceChanges[1]);
  }

  logger.info(`Token ${params.symbol} launched at ${mint.toBase58()} (pool ${prepared.poolAddress}): ${signature}`);
  return { ...base, status: 1 /* CONFIRMED */, data };
}

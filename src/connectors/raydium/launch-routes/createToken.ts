import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { CreateTokenResponseType } from '../../../schemas/launch-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PumpConfig } from '../../pump/pump.config';
import { uploadTokenMetadata } from '../../pump/pump.utils';
import {
  LaunchlabLaunchOptions,
  buyInstruction,
  createInstruction,
  freshPool,
  globalConfigFor,
  launchCurveParams,
  launchQuoteMint,
  launchTradeAccounts,
  poolAddressFor,
  quoteBuyExactIn,
  readGlobal,
  readPlatform,
} from '../launchlab/launchlab';
import { RaydiumConfig } from '../raydium.config';

/** The unified create-token body as Raydium's LaunchLab reads it. */
export interface RaydiumCreateTokenParams extends LaunchlabLaunchOptions {
  name: string;
  symbol: string;
  /** Pre-pinned metadata JSON URI. Pass this OR imageUrl. */
  metadataUri?: string;
  /** Image to publish with the metadata, through the same endpoint pump uses. */
  imageUrl?: string;
  description?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  /** The first buy, in the quote, atomic with the launch. */
  devBuyAmount?: number;
  /** SOL or USDC, by symbol or mint. Default SOL. */
  quoteToken?: string;
  /** The token's creator when it is not the signing wallet (e.g. a program that collects its creator fees). */
  creator?: string;
}

export interface RaydiumPreparedLaunch {
  mintKeypair: Keypair;
  metadataUri: string;
  poolAddress: string;
}

// Metaplex token-metadata limits, which LaunchLab's create writes the mint's metadata with.
const MAX_NAME_BYTES = 32;
const MAX_SYMBOL_BYTES = 10;
const MAX_URI_BYTES = 200;

/** A 400 naming every metadata field over its on-chain limit, in bytes. */
function checkTokenMetadata(name: string, symbol: string, uri?: string): void {
  const over = (
    [
      ['name', name, MAX_NAME_BYTES],
      ['symbol', symbol, MAX_SYMBOL_BYTES],
      ['URI', uri, MAX_URI_BYTES],
    ] as const
  ).filter(([, v, max]) => v !== undefined && Buffer.byteLength(v, 'utf8') > max);
  if (over.length > 0) {
    throw httpErrors.badRequest(
      over
        .map(([what, v, max]) => `the token ${what} is ${Buffer.byteLength(v!, 'utf8')} bytes; at most ${max}`)
        .join('; '),
    );
  }
}

/**
 * Validate the request, resolve the metadata URI — publishing the image and
 * metadata the way pump does when the caller passed an imageUrl — and make the
 * mint keypair. Names, symbols and URIs are held to the Metaplex limits.
 */
export async function prepareCreateToken(params: RaydiumCreateTokenParams): Promise<RaydiumPreparedLaunch> {
  checkTokenMetadata(params.name, params.symbol, params.metadataUri);
  const { metadataUri: givenUri, imageUrl } = params;
  let metadataUri: string;
  if (givenUri && !imageUrl) {
    metadataUri = givenUri;
  } else if (imageUrl && !givenUri) {
    metadataUri = await uploadTokenMetadata(PumpConfig.config.metadataUploadUrl, {
      name: params.name,
      symbol: params.symbol,
      description: params.description,
      imageUrl,
      twitter: params.twitter,
      telegram: params.telegram,
      website: params.website,
    });
    checkTokenMetadata(params.name, params.symbol, metadataUri);
  } else {
    throw httpErrors.badRequest(
      'Pass exactly one of metadataUri (pre-pinned metadata JSON) or imageUrl (Gateway publishes the metadata).',
    );
  }
  if (params.devBuyAmount !== undefined && !(params.devBuyAmount >= 0)) {
    throw httpErrors.badRequest('devBuyAmount must be a non-negative number');
  }
  const mintKeypair = Keypair.generate();
  const quoteMint = launchQuoteMint(params.quoteToken);
  return {
    mintKeypair,
    metadataUri,
    poolAddress: poolAddressFor(mintKeypair.publicKey, quoteMint).toBase58(),
  };
}

/** A quote amount in its base units. */
const raw = (amount: number, decimals: number) => new BN(new Decimal(amount).mul(Decimal.pow(10, decimals)).toFixed(0));

/**
 * `initialize_v2` on Raydium's platform and, with `devBuyAmount`, the wallet's
 * first buy on the curve it creates — the wallet's associated account for the
 * new token, a wrap of the SOL it spends (unwrapped after when the wSOL
 * account is this transaction's), and `buy_exact_in` quoted off the fresh pool.
 * The wallet pays; `creator` defaults to it.
 */
export async function createTokenInstructions(
  solana: Solana,
  walletPk: PublicKey,
  params: RaydiumCreateTokenParams,
  prepared: RaydiumPreparedLaunch,
): Promise<TransactionInstruction[]> {
  const connection = solana.connection;
  const quoteMint = launchQuoteMint(params.quoteToken);
  let creator: PublicKey;
  try {
    creator = params.creator ? new PublicKey(params.creator) : walletPk;
  } catch {
    throw httpErrors.badRequest(`Invalid creator: ${params.creator}`);
  }
  const global = await readGlobal(connection, globalConfigFor(quoteMint));
  const curve = await launchCurveParams(connection, quoteMint, global, params);
  const mint = prepared.mintKeypair.publicKey;
  const instructions = [
    createInstruction({
      payer: walletPk,
      creator,
      mint,
      quoteMint,
      name: params.name,
      symbol: params.symbol,
      uri: prepared.metadataUri,
      params: curve,
    }),
  ];
  if (!params.devBuyAmount) return instructions;

  const quoteDecimals = quoteMint.equals(NATIVE_MINT) ? 9 : 6;
  const amountIn = raw(params.devBuyAmount, quoteDecimals);
  const quote = quoteBuyExactIn(freshPool(curve, global), global, await readPlatform(connection), amountIn);
  if (quote.amountIn.lt(amountIn)) {
    throw httpErrors.badRequest(
      `A first buy of ${params.devBuyAmount} buys the whole curve for less; the most it can spend is ` +
        `${new Decimal(quote.amountIn.toString()).div(Decimal.pow(10, quoteDecimals))}`,
    );
  }
  const slippageBps = Math.round(RaydiumConfig.config.slippagePct * 100);
  const minOut = quote.amountOut.muln(10_000 - slippageBps).divn(10_000);
  const accounts = launchTradeAccounts(mint, quoteMint, creator, walletPk);
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(walletPk, accounts.userBase, walletPk, mint, TOKEN_PROGRAM_ID),
  );
  const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, walletPk, true, TOKEN_PROGRAM_ID);
  const wsolIsNew = quoteMint.equals(NATIVE_MINT) && !(await connection.getAccountInfo(wsol));
  if (quoteMint.equals(NATIVE_MINT)) {
    instructions.push(...(await solana.wrapSOL(walletPk, amountIn.toNumber(), TOKEN_PROGRAM_ID, true)));
  }
  instructions.push(buyInstruction(accounts, amountIn, minOut));
  if (wsolIsNew) instructions.push(solana.unwrapSOL(walletPk, TOKEN_PROGRAM_ID));
  return instructions;
}

export async function createToken(
  network: string,
  walletAddress: string,
  params: RaydiumCreateTokenParams,
  prepared: RaydiumPreparedLaunch,
): Promise<CreateTokenResponseType> {
  const solana = await Solana.getInstance(network);
  const walletPk = new PublicKey(walletAddress);
  const mint = prepared.mintKeypair.publicKey;
  const instructions = await createTokenInstructions(solana, walletPk, params, prepared);
  logger.info(`Creating Raydium LaunchLab token ${params.symbol} (${mint.toBase58()}) for ${walletAddress}`);

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = walletPk;
  // The mint keypair signs as an ephemeral extra signer: in build mode it
  // partial-signs, is surfaced in extraSigners, and is discarded.
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
  if (!txData) return { ...base, status: 0 /* PENDING */ };

  const data: NonNullable<CreateTokenResponseType['data']> = { fee: txData.meta.fee / 1e9 };
  if (params.devBuyAmount) {
    const quoteMint = launchQuoteMint(params.quoteToken);
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      mint.toBase58(),
      quoteMint.toBase58(),
    ]);
    data.tokenAmountBought = Math.abs(balanceChanges[0]);
    data.quoteTokenAmountSpent = Math.abs(balanceChanges[1]);
  }
  logger.info(`Token ${params.symbol} launched on LaunchLab at ${mint.toBase58()}: ${signature}`);
  return { ...base, status: 1 /* CONFIRMED */, data };
}

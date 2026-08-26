import {
  ApiClmmConfigInfo,
  ApiV3Token,
  ClmmConfigInfo,
  CLMM_PROGRAM_ID,
  DEVNET_PROGRAM_ID,
} from '@raydium-io/raydium-sdk-v2';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';

/** Resolves a token symbol or mint address to a PublicKey. */
async function resolveMint(solana: Solana, tokenOrAddress: string): Promise<PublicKey> {
  const tokenInfo = await solana.getToken(tokenOrAddress);
  if (tokenInfo) return new PublicKey(tokenInfo.address);
  try {
    return new PublicKey(tokenOrAddress);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', tokenOrAddress));
  }
}

/** Detects whether a mint is owned by the Token or Token-2022 program. */
async function getMintProgram(solana: Solana, mint: PublicKey): Promise<PublicKey> {
  const info = await solana.connection.getAccountInfo(mint);
  if (!info) throw httpErrors.badRequest(`Mint account not found: ${mint.toBase58()}`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw httpErrors.badRequest(`Mint ${mint.toBase58()} is not an SPL token mint`);
}

/**
 * The Raydium CLMM SDK only reads `address`, `decimals` and `programId` off the mint objects passed
 * to `clmm.createPool` (the on-chain init instruction needs nothing else). The `ApiV3Token` type
 * additionally requires display metadata (symbol, name, logoURI, …) that never touches the chain, so
 * we build the object from the authoritative on-chain values and cast — rather than inventing fake
 * metadata — to satisfy the type.
 */
function toApiV3Token(mint: PublicKey, decimals: number, programId: PublicKey): ApiV3Token {
  return {
    address: mint.toBase58(),
    decimals,
    programId: programId.toBase58(),
  } as unknown as ApiV3Token;
}

/**
 * Fetches the current market price (quote per base) from the unified swap router so a new pool can
 * be initialized on-market instead of at an arbitrary ratio. Off-market initialization invites
 * arbitrage bots to instantly move the price. Uses a SELL quote of 1 base token via the network's
 * configured swap provider (Jupiter aggregates existing venues); throws a clear error if no market
 * route exists.
 */
async function fetchMarketPrice(network: string, baseToken: string, quoteToken: string): Promise<number> {
  const { getSwapQuote } = await import('../../../trading/market-price');
  let quote: any;
  try {
    // Probe with 1 base token — we only need the price ratio, not a real trade size.
    quote = await getSwapQuote(`solana-${network}`, baseToken, quoteToken, 1, 'SELL');
  } catch (e: any) {
    throw httpErrors.badRequest(
      `Could not fetch a market price for ${baseToken}/${quoteToken} to initialize the pool (${e.message}). ` +
        'Pass initialPrice explicitly.',
    );
  }
  if (!quote || !quote.amountIn || !quote.amountOut) {
    throw httpErrors.badRequest(`No market route found for ${baseToken}/${quoteToken}. Pass initialPrice explicitly.`);
  }
  return quote.amountOut / quote.amountIn; // quote token per base token
}

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  initialPrice?: number,
  ammConfigIndex: number = 0,
): Promise<CreatePoolResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Set the SDK owner to the wallet's public key so createPool derives the right owner. The tx is
  // built unsigned; signing/sending is delegated to sendAndConfirmTransactionForWallet.
  await raydium.setOwner(new PublicKey(walletAddress));

  const baseMint = await resolveMint(solana, baseToken);
  const quoteMint = await resolveMint(solana, quoteToken);
  if (baseMint.equals(quoteMint)) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  const [baseProgram, quoteProgram] = await Promise.all([
    getMintProgram(solana, baseMint),
    getMintProgram(solana, quoteMint),
  ]);
  const [baseMintInfo, quoteMintInfo] = await Promise.all([
    getMint(solana.connection, baseMint, undefined, baseProgram),
    getMint(solana.connection, quoteMint, undefined, quoteProgram),
  ]);
  const baseDecimals = baseMintInfo.decimals;
  const quoteDecimals = quoteMintInfo.decimals;

  // Resolve the seed price (quote per base). Priority:
  //   1) explicit initialPrice
  //   2) live market price from the unified swap router — so the pool opens on-market.
  let seedPrice: number;
  let seedSource: string;
  if (initialPrice !== undefined) {
    if (initialPrice <= 0) throw httpErrors.badRequest('initialPrice must be greater than zero');
    seedPrice = initialPrice;
    seedSource = 'initialPrice';
  } else {
    seedPrice = await fetchMarketPrice(network, baseToken, quoteToken);
    seedSource = 'market (unified swap router)';
  }
  logger.info(`Initializing Raydium CLMM pool at ${seedPrice} ${quoteToken}/${baseToken} [${seedSource}]`);

  // Fetch the CLMM amm-config list dynamically from the Raydium API — no hardcoded fallback.
  let ammConfigs: ApiClmmConfigInfo[];
  try {
    ammConfigs = await raydium.raydiumSDK.api.getClmmConfigs();
  } catch (e: any) {
    throw httpErrors.internalServerError(`Could not fetch Raydium CLMM amm configs: ${e.message}`);
  }
  if (!ammConfigs || ammConfigs.length === 0) {
    throw httpErrors.internalServerError('Raydium API returned no CLMM amm configs');
  }
  if (ammConfigIndex < 0 || ammConfigIndex >= ammConfigs.length) {
    throw httpErrors.badRequest(`ammConfigIndex ${ammConfigIndex} out of range (0-${ammConfigs.length - 1})`);
  }
  const apiConfig = ammConfigs[ammConfigIndex];

  // The API returns ApiClmmConfigInfo (id: string) but clmm.createPool wants ClmmConfigInfo
  // (id: PublicKey, plus fundOwner/description which the init instruction never reads).
  const ammConfig: ClmmConfigInfo = {
    ...apiConfig,
    id: new PublicKey(apiConfig.id),
    fundOwner: '',
    description: '',
  };

  // Select the CLMM program for the connector's cluster, mirroring how the AMM createPool derives
  // mainnet vs devnet from solana.network.
  const isMainnet = solana.network === 'mainnet-beta';
  const programId = isMainnet ? CLMM_PROGRAM_ID : DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID;

  // NOTE on mint ordering + price: the CLMM program requires canonical mint ordering (mint1 < mint2
  // by byte-compared pubkey). clmm.createPool sorts internally and, when it swaps mint1/mint2, it
  // inverts initialPrice in lockstep (initialPrice -> 1/initialPrice) so the on-chain sqrtPrice is
  // always correct. We therefore pass base as mint1 / quote as mint2 with initialPrice = seedPrice
  // (quote per base = mint2 per mint1) and let the SDK handle ordering. The reported `price`
  // (seedPrice) stays quote-per-base regardless of the SDK's internal sort.
  const {
    transaction,
    signers: sdkSigners,
    extInfo,
  } = await raydium.raydiumSDK.clmm.createPool({
    programId,
    owner: new PublicKey(walletAddress),
    mint1: toApiV3Token(baseMint, baseDecimals, baseProgram),
    mint2: toApiV3Token(quoteMint, quoteDecimals, quoteProgram),
    ammConfig,
    initialPrice: new Decimal(seedPrice),
    txVersion: raydium.txVersion,
    feePayer: new PublicKey(walletAddress),
  });

  const poolAddress = extInfo.address.id;
  logger.info(`Creating Raydium CLMM pool ${poolAddress} (${baseToken}/${quoteToken})`);

  const { signature } = await solana.sendAndConfirmTransactionForWallet(
    transaction,
    walletAddress,
    (sdkSigners as Keypair[]) ?? [],
  );
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    return {
      signature,
      status: 1, // CONFIRMED
      poolAddress,
      price: seedPrice,
      data: {
        fee: txData.meta.fee / 1e9,
      },
    };
  }
  return { signature, status: 0, poolAddress, price: seedPrice }; // PENDING
}

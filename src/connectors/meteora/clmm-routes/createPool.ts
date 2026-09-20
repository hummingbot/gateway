import DLMM, {
  ActivationType,
  deriveCustomizablePermissionlessLbPair,
  getTokenDecimals,
  LBCLMM_PROGRAM_IDS,
} from '@meteora-ag/dlmm';
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';

// A DLMM pool is created with no liquidity; the initial active bin only encodes the starting
// price. binStep/feeBps have no universal default, so both are required request params.

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

/**
 * Fetches the current market price (quote per base) from the unified swap router so a new pool can be
 * initialized on-market instead of at an arbitrary price. Uses a SELL quote of 1 base token via the
 * network's configured swap provider (Jupiter aggregates existing venues); throws a clear error if no
 * market route exists.
 */
async function fetchMarketPrice(network: string, baseToken: string, quoteToken: string): Promise<number> {
  const { getSwapQuote } = await import('../../../trading/market-price');
  let quote: any;
  try {
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

/**
 * Creates and initializes a new Meteora DLMM (LB pair) pool at an initial price. No liquidity is
 * seeded — that is a separate open-position operation, so the returned added amounts are zero.
 *
 * SDK method: `DLMM.createCustomizablePermissionlessLbPair2` (chosen over the non-`2` variant
 * because `2` reads each mint's owner program and therefore supports both SPL Token and Token-2022
 * mints, while the non-`2` variant only supports the legacy Token program).
 *
 * activeId (initial active bin) encodes the starting price. It is computed with the SDK's own
 * static price math so it matches the on-chain program exactly:
 *   pricePerLamport = DLMM.getPricePerLamport(decimalsX, decimalsY, poolPrice)
 *                   = poolPrice * 10^(decimalsY - decimalsX)
 *   activeId        = DLMM.getBinIdFromPrice(pricePerLamport, binStep, false)
 *                   = ceil( ln(pricePerLamport) / ln(1 + binStep/10000) )
 * This is the inverse of the SDK's `getPriceOfBinByBinId(binId, binStep) = (1 + binStep/10000)^binId`
 * (verified in node_modules/@meteora-ag/dlmm/dist/index.js: getPricePerLamport L14796,
 * getBinIdFromPrice L14799, getPriceOfBinByBinId L10009). activeId therefore lands within one bin
 * step of initialPrice.
 *
 * Mint ordering: the LB pair program requires the two mints in canonical byte order
 * (tokenX < tokenY). `createCustomizablePermissionlessLbPair2` passes tokenX/tokenY straight to the
 * instruction (it does NOT sort), so we sort here. DLMM prices are always tokenY-per-tokenX, so when
 * the quote token sorts before the base token we invert initialPrice to keep the pool price correct.
 */
export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  initialPrice?: number,
  binStep?: number,
  feeBps?: number,
): Promise<CreatePoolResponseType> {
  if (initialPrice !== undefined && initialPrice <= 0) {
    throw httpErrors.badRequest('initialPrice must be greater than zero');
  }
  if (binStep === undefined) {
    throw httpErrors.badRequest(
      'binStep is required (bin step in bps, e.g. 1, 2, 4, 5, 10, 20, 25, 50, 100). ' +
        'It sets the pool granularity and cannot be changed after creation.',
    );
  }
  if (!Number.isInteger(binStep) || binStep <= 0) {
    throw httpErrors.badRequest('binStep must be a positive integer number of basis points');
  }
  if (feeBps === undefined) {
    throw httpErrors.badRequest('feeBps is required (base fee in bps, e.g. 20 = 0.20%)');
  }
  if (!Number.isInteger(feeBps) || feeBps <= 0) {
    throw httpErrors.badRequest('feeBps must be a positive integer number of basis points');
  }

  const solana = await Solana.getInstance(network);

  let walletPublicKey: PublicKey;
  try {
    walletPublicKey = new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  const baseMint = await resolveMint(solana, baseToken);
  const quoteMint = await resolveMint(solana, quoteToken);
  if (baseMint.equals(quoteMint)) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  // Resolve the initial price (quote per base): explicit initialPrice, else the live market price so
  // the pool opens on-market.
  const seedPrice = initialPrice !== undefined ? initialPrice : await fetchMarketPrice(network, baseToken, quoteToken);

  // Canonical mint ordering required by the LB pair program: tokenX < tokenY by raw bytes.
  const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
    for (let i = 0; i < a.length && i < b.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return a.length - b.length;
  };
  const baseIsX = compareBytes(baseMint.toBytes(), quoteMint.toBytes()) <= 0;
  const tokenX = baseIsX ? baseMint : quoteMint;
  const tokenY = baseIsX ? quoteMint : baseMint;

  // DLMM price is always tokenY per tokenX. initialPrice is quote per base, so it maps directly
  // when base sorts as X, and is inverted when quote sorts as X.
  const poolPrice = baseIsX ? seedPrice : 1 / seedPrice;

  const [decimalsX, decimalsY] = await Promise.all([
    getTokenDecimals(solana.connection, tokenX),
    getTokenDecimals(solana.connection, tokenY),
  ]);

  // Compute the initial active bin id using the SDK's own price math (see doc comment above).
  const pricePerLamport = DLMM.getPricePerLamport(decimalsX, decimalsY, poolPrice);
  const activeIdNum = DLMM.getBinIdFromPrice(pricePerLamport, binStep, false);
  const activeId = new BN(activeIdNum);

  const cluster = solana.network as any;
  const programId = LBCLMM_PROGRAM_IDS[cluster];
  if (!programId) {
    throw httpErrors.badRequest(`Meteora DLMM is not available on network: ${network}`);
  }

  // Derive the LB pair PDA (order-independent — the helper sorts internally).
  const [lbPair] = deriveCustomizablePermissionlessLbPair(tokenX, tokenY, new PublicKey(programId));
  const poolAddress = lbPair.toBase58();

  const existing = await solana.connection.getAccountInfo(lbPair);
  if (existing) {
    throw httpErrors.badRequest(`Pool already exists for this token pair and bin step: ${poolAddress}`);
  }

  logger.info(
    `Creating Meteora DLMM pool ${poolAddress} (${baseToken}/${quoteToken}) at ${seedPrice} ` +
      `${quoteToken}/${baseToken} [binStep=${binStep}bps, feeBps=${feeBps}, activeId=${activeIdNum}]`,
  );

  let transaction: Transaction;
  try {
    transaction = await DLMM.createCustomizablePermissionlessLbPair2(
      solana.connection,
      new BN(binStep),
      tokenX,
      tokenY,
      activeId,
      new BN(feeBps),
      ActivationType.Timestamp,
      false, // hasAlphaVault
      walletPublicKey, // creatorKey
      undefined, // activationPoint
      undefined, // creatorPoolOnOffControl
      { cluster },
    );
  } catch (e: any) {
    // computeBaseFactorFromFeeBps throws when feeBps/binStep are incompatible (non-integer base
    // factor or over/underflow). Surface as a clear 400 instead of a 500.
    const msg = typeof e === 'string' ? e : e?.message || 'unknown error';
    throw httpErrors.badRequest(
      `Could not build pool with binStep=${binStep} and feeBps=${feeBps}: ${msg}. ` +
        'The base fee must resolve to a valid factor for the chosen bin step; try a different feeBps.',
    );
  }

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
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

import { ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG, PoolUtil, PriceMath } from '@orca-so/whirlpools-sdk';
import { Static } from '@sinclair/typebox';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponse, CreatePoolResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Orca } from '../orca';
import { OrcaClmmCreatePoolRequest } from '../schemas';

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
 * Fetches the current market price (quote per base) from the unified swap router so a new pool can
 * be initialized on-market instead of at an arbitrary ratio. Off-market initialization invites
 * arbitrage bots to instantly move the price. Uses a SELL quote of 1 base token via the network's
 * configured swap provider; throws a clear error if no market route exists.
 */
async function fetchMarketPrice(network: string, baseToken: string, quoteToken: string): Promise<number> {
  const { getUnifiedQuoteSwap } = await import('../../../trading/swap/quote');
  let quote: any;
  try {
    // Probe with 1 base token — we only need the price ratio, not a real trade size.
    quote = await getUnifiedQuoteSwap(`solana-${network}`, baseToken, quoteToken, 1, 'SELL');
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
  tickSpacing?: number,
): Promise<CreatePoolResponseType> {
  // tickSpacing selects the fee tier; a FeeTier account for the config+tickSpacing must exist
  // on-chain. Validate it up front so bad input fails fast with a clear 400.
  if (tickSpacing === undefined || !Number.isInteger(tickSpacing) || tickSpacing <= 0) {
    throw httpErrors.badRequest('tickSpacing must be a positive integer');
  }

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  // Build with the wallet's public key as authority — signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which knows how to sign for each wallet type.
  const client = await orca.getWhirlpoolClientForWallet(walletAddress);
  const funder = client.getContext().wallet.publicKey;

  const baseMint = await resolveMint(solana, baseToken);
  const quoteMint = await resolveMint(solana, quoteToken);
  if (baseMint.equals(quoteMint)) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  // Fetch decimals dynamically from on-chain mint info (handles Token and Token-2022).
  const [baseMintInfo, quoteMintInfo] = await Promise.all([
    client.getFetcher().getMintInfo(baseMint),
    client.getFetcher().getMintInfo(quoteMint),
  ]);
  if (!baseMintInfo) throw httpErrors.badRequest(`Mint account not found: ${baseMint.toBase58()}`);
  if (!quoteMintInfo) throw httpErrors.badRequest(`Mint account not found: ${quoteMint.toBase58()}`);
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
  logger.info(`Initializing Orca CLMM pool at ${seedPrice} ${quoteToken}/${baseToken} [${seedSource}]`);

  // Whirlpools require canonical mint ordering (tokenA < tokenB by byte-compared pubkey), and
  // client.createPool ASSERTS the order rather than sorting — so we sort here. PriceMath expects
  // price expressed as tokenB-per-tokenA. Our seedPrice is quote-per-base, so:
  //   - base sorts as tokenA (base < quote): price stays quote-per-base = seedPrice.
  //   - base sorts as tokenB (quote < base): price becomes base-per-quote = 1/seedPrice,
  //     and the decimals A/B swap with the tokens.
  // The reported `price` (seedPrice) stays quote-per-base regardless of the on-chain sort.
  const [orderedA] = PoolUtil.orderMints(baseMint, quoteMint);
  const mintA = new PublicKey(orderedA.toString());
  const baseIsA = mintA.equals(baseMint);
  const mintB = baseIsA ? quoteMint : baseMint;
  const decimalsA = baseIsA ? baseDecimals : quoteDecimals;
  const decimalsB = baseIsA ? quoteDecimals : baseDecimals;
  const priceAB = baseIsA ? seedPrice : 1 / seedPrice;

  const initialTick = PriceMath.priceToInitializableTickIndex(new Decimal(priceAB), decimalsA, decimalsB, tickSpacing);

  logger.info(
    `Orca createPool: config=${ORCA_WHIRLPOOLS_CONFIG.toBase58()}, program=${ORCA_WHIRLPOOL_PROGRAM_ID.toBase58()}, ` +
      `tokenMintA=${mintA.toBase58()}, tokenMintB=${mintB.toBase58()}, tickSpacing=${tickSpacing}, initialTick=${initialTick}`,
  );

  const { poolKey, tx } = await client.createPool(
    ORCA_WHIRLPOOLS_CONFIG,
    mintA,
    mintB,
    tickSpacing,
    initialTick,
    funder,
  );
  const poolAddress = poolKey.toBase58();

  // Pre-check: refuse to re-initialize an existing pool. createPool only builds the tx (no send),
  // so we can derive the pool address and check for an existing account before sending.
  const existing = await solana.connection.getAccountInfo(poolKey);
  if (existing) {
    throw httpErrors.badRequest(`Pool already exists for this token pair and tickSpacing: ${poolAddress}`);
  }

  logger.info(`Creating Orca CLMM pool ${poolAddress} (${baseToken}/${quoteToken})`);

  // createPool generates the two token-vault keypairs internally; they are returned on the built
  // transaction's `signers` and must co-sign. Pass them as extra signers.
  const built = await tx.build();
  const extraSigners = (built.signers as Keypair[]) ?? [];
  const { signature } = await solana.sendAndConfirmTransactionForWallet(built.transaction, walletAddress, extraSigners);

  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (txData) {
    return {
      signature,
      status: 1, // CONFIRMED
      poolAddress,
      price: seedPrice,
      data: {
        fee: txData.meta.fee / 1e9,
        // Pool created + initialized only — no liquidity/position seeded.
        baseTokenAmountAdded: 0,
        quoteTokenAmountAdded: 0,
      },
    };
  }
  return { signature, status: 0, poolAddress, price: seedPrice }; // PENDING
}

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description:
          'Create and initialize a new Orca (Whirlpools) CLMM pool at an initial price. Does not open or seed a position.',
        tags: ['/connector/orca'],
        body: OrcaClmmCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, initialPrice, tickSpacing } = request.body;
        return await createPool(network, walletAddress, baseToken, quoteToken, initialPrice, tickSpacing);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;

import { MIN_SQRT_PRICE, MAX_SQRT_PRICE, derivePoolAddress, getTokenDecimals } from '@meteora-ag/cp-amm-sdk';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponse, CreatePoolResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraAmmCreatePoolRequest } from '../schemas';

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
 * Fraction of the seed amount used to probe the market price. Quoting the full seed amount would
 * return the average execution price of that trade (including price impact and routing fees),
 * which for large seeds sits below the marginal market price and would open the pool off-market.
 * A small probe keeps the quote close to the marginal price.
 */
const MARKET_PRICE_PROBE_FRACTION = 0.01;

/**
 * Fetches the current market price (quote per base) from the unified swap router so a new pool
 * can be seeded on-market instead of at an arbitrary ratio. Seeding off-market invites arbitrage
 * bots to instantly rebalance the pool (see docs/connectors/meteora-damm-v2.md). Uses a SELL quote
 * for a small probe fraction of the seed amount via the network's configured swap provider
 * (Jupiter aggregates existing venues); throws a clear error if no market route exists.
 */
async function fetchMarketPrice(
  network: string,
  baseToken: string,
  quoteToken: string,
  seedAmount: number,
): Promise<number> {
  const probeAmount = seedAmount * MARKET_PRICE_PROBE_FRACTION;
  const { getUnifiedQuoteSwap } = await import('../../../trading/swap/quote');
  let quote: any;
  try {
    quote = await getUnifiedQuoteSwap(`solana-${network}`, baseToken, quoteToken, probeAmount, 'SELL');
  } catch (e: any) {
    throw httpErrors.badRequest(
      `Could not fetch a market price for ${baseToken}/${quoteToken} to seed the pool (${e.message}). ` +
        'Pass initialPrice or quoteTokenAmount explicitly.',
    );
  }
  if (!quote || !quote.amountIn || !quote.amountOut) {
    throw httpErrors.badRequest(
      `No market route found for ${baseToken}/${quoteToken}. Pass initialPrice or quoteTokenAmount explicitly.`,
    );
  }
  return quote.amountOut / quote.amountIn; // quote token per base token
}

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount?: number,
  configAddress?: string,
  initialPrice?: number,
): Promise<CreatePoolResponseType> {
  if (!configAddress) {
    throw httpErrors.badRequest(
      'configAddress is required. DAMM v2 pools are created against a config account that defines the ' +
        'fee tier and parameters; many configs are launch configs with very high starting fees, so Gateway ' +
        'does not auto-select one. Choose a config from the Meteora config list and pass its address. ' +
        'See docs/connectors/meteora-damm-v2.md.',
    );
  }

  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const tokenAMint = await resolveMint(solana, baseToken);
  const tokenBMint = await resolveMint(solana, quoteToken);
  if (tokenAMint.equals(tokenBMint)) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  let config: PublicKey;
  try {
    config = new PublicKey(configAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid config address: ${configAddress}`);
  }

  let configState;
  try {
    configState = await meteoraDamm.cpAmm.fetchConfigState(config);
  } catch {
    throw httpErrors.badRequest(`Config not found: ${configAddress}`);
  }

  const pool = derivePoolAddress(config, tokenAMint, tokenBMint);
  if (await meteoraDamm.cpAmm.isPoolExist(pool)) {
    throw httpErrors.badRequest(`Pool already exists for this token pair and config: ${pool.toBase58()}`);
  }

  const [tokenAProgram, tokenBProgram] = await Promise.all([
    getMintProgram(solana, tokenAMint),
    getMintProgram(solana, tokenBMint),
  ]);
  const [tokenADecimal, tokenBDecimal] = await Promise.all([
    getTokenDecimals(solana.connection, tokenAMint, tokenAProgram),
    getTokenDecimals(solana.connection, tokenBMint, tokenBProgram),
  ]);

  if (baseTokenAmount <= 0) {
    throw httpErrors.badRequest('baseTokenAmount must be greater than zero');
  }

  // Resolve the seed price (quote per base). Priority:
  //   1) explicit initialPrice
  //   2) explicit quoteTokenAmount (the base:quote ratio sets the price)
  //   3) live market price from the unified swap router — so the pool opens on-market and is not
  //      immediately arbitraged/sniped (see docs/connectors/meteora-damm-v2.md).
  let seedPrice: number;
  let seedSource: string;
  if (initialPrice !== undefined) {
    if (initialPrice <= 0) throw httpErrors.badRequest('initialPrice must be greater than zero');
    seedPrice = initialPrice;
    seedSource = 'initialPrice';
  } else if (quoteTokenAmount !== undefined) {
    if (quoteTokenAmount <= 0) throw httpErrors.badRequest('quoteTokenAmount must be greater than zero');
    seedPrice = quoteTokenAmount / baseTokenAmount;
    seedSource = 'quoteTokenAmount ratio';
  } else {
    seedPrice = await fetchMarketPrice(network, baseToken, quoteToken, baseTokenAmount);
    seedSource = 'market (unified swap router)';
  }

  const effectiveQuoteAmount = baseTokenAmount * seedPrice;
  logger.info(
    `Seeding pool at ${seedPrice} ${quoteToken}/${baseToken} [${seedSource}]: ` +
      `${baseTokenAmount} base + ${effectiveQuoteAmount} quote`,
  );

  const tokenAAmount = new BN(new Decimal(baseTokenAmount).mul(new Decimal(10).pow(tokenADecimal)).toFixed(0));
  const tokenBAmount = new BN(new Decimal(effectiveQuoteAmount).mul(new Decimal(10).pow(tokenBDecimal)).toFixed(0));
  if (tokenAAmount.isZero() || tokenBAmount.isZero()) {
    throw httpErrors.badRequest('Computed token amounts are zero — increase baseTokenAmount');
  }

  // The deposit ratio sets the initial price; liquidity spans the full price range.
  const { initSqrtPrice, liquidityDelta } = meteoraDamm.cpAmm.preparePoolCreationParams({
    tokenAAmount,
    tokenBAmount,
    minSqrtPrice: MIN_SQRT_PRICE,
    maxSqrtPrice: MAX_SQRT_PRICE,
    collectFeeMode: configState.collectFeeMode,
  });

  const positionNft = Keypair.generate();
  logger.info(
    `Creating Meteora DAMM v2 pool ${pool.toBase58()} (${baseToken}/${quoteToken}) with position NFT ${positionNft.publicKey.toBase58()}`,
  );

  const transaction: Transaction = await meteoraDamm.cpAmm.createPool({
    creator: new PublicKey(walletAddress),
    payer: new PublicKey(walletAddress),
    config,
    positionNft: positionNft.publicKey,
    tokenAMint,
    tokenBMint,
    initSqrtPrice,
    liquidityDelta,
    tokenAAmount,
    tokenBAmount,
    activationPoint: null,
    tokenAProgram,
    tokenBProgram,
  });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [positionNft]);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      tokenAMint.toBase58(),
      tokenBMint.toBase58(),
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      poolAddress: pool.toBase58(),
      price: seedPrice,
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: Math.abs(balanceChanges[0]),
        quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0, poolAddress: pool.toBase58(), price: seedPrice }; // PENDING
}

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: typeof MeteoraAmmCreatePoolRequest.static;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description: 'Create a new Meteora DAMM v2 pool and seed it with initial liquidity',
        tags: ['/connector/meteora'],
        body: MeteoraAmmCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          configAddress,
          initialPrice,
        } = request.body;
        return await createPool(
          network,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          configAddress,
          initialPrice,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;

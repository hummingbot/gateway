import { Static } from '@sinclair/typebox';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponse, CreatePoolResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { PancakeswapSol, PANCAKESWAP_CLMM_PROGRAM_ID } from '../pancakeswap-sol';
import { buildCreatePoolInstruction } from '../pancakeswap-sol.instructions';
import { priceToSqrtPriceX64 } from '../pancakeswap-sol.math';
import { buildTransactionWithInstructions } from '../pancakeswap-sol.transactions';
import { PancakeswapSolClmmCreatePoolRequest } from '../schemas';

/** Lexicographic byte comparison (mirrors Buffer.compare) for canonical mint ordering. */
function compareBytes(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

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
 * Fetches the current market price (quote per base) from the unified swap router so a new pool can be
 * initialized on-market instead of at an arbitrary ratio. Off-market initialization invites arbitrage
 * bots to instantly move the price. Probes with a SELL quote of 1 base token; throws a clear error if
 * no market route exists.
 */
async function fetchMarketPrice(network: string, baseToken: string, quoteToken: string): Promise<number> {
  const { getUnifiedQuoteSwap } = await import('../../../trading/swap/quote');
  let quote: any;
  try {
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

/**
 * Derive the amm_config PDA for a fee-config index. The program (a Raydium CLMM
 * fork) seeds it with ["amm_config", index] — index encoded big-endian, the same
 * Raydium convention this connector's tick_array PDAs use. The little-endian
 * (plain Anchor/borsh) form is tried as a fallback before failing.
 */
async function resolveAmmConfigByIndex(solana: Solana, ammConfigIndex: number): Promise<PublicKey> {
  if (!Number.isInteger(ammConfigIndex) || ammConfigIndex < 0 || ammConfigIndex > 0xffff) {
    throw httpErrors.badRequest(`ammConfigIndex must be an integer in [0, 65535], got ${ammConfigIndex}`);
  }
  const candidates: PublicKey[] = [];
  for (const endian of ['BE', 'LE'] as const) {
    const indexBuffer = Buffer.alloc(2);
    if (endian === 'BE') indexBuffer.writeUInt16BE(ammConfigIndex, 0);
    else indexBuffer.writeUInt16LE(ammConfigIndex, 0);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('amm_config'), indexBuffer],
      PANCAKESWAP_CLMM_PROGRAM_ID,
    );
    candidates.push(pda);
  }
  for (const pda of candidates) {
    const info = await solana.connection.getAccountInfo(pda);
    if (info && info.owner.equals(PANCAKESWAP_CLMM_PROGRAM_ID)) {
      return pda;
    }
  }
  throw httpErrors.badRequest(
    `No amm_config account found on-chain for index ${ammConfigIndex} ` +
      `(tried ${candidates.map((c) => c.toBase58()).join(', ')})`,
  );
}

/**
 * Create and initialize (but do NOT seed a position for) a PancakeSwap Solana CLMM pool.
 *
 * @param ammConfigIndex  Fee-config index; resolves to the program's amm_config PDA
 *                        (["amm_config", index]) and is validated on-chain. Default 0.
 */
export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  initialPrice?: number,
  ammConfigIndex: number = 0,
): Promise<CreatePoolResponseType> {
  const solana = await Solana.getInstance(network);
  // Ensure the connector singleton is initialized (mirrors the other pancakeswap-sol routes).
  await PancakeswapSol.getInstance(network);

  const ammConfigPubkey = await resolveAmmConfigByIndex(solana, ammConfigIndex);

  // Resolve mints, decimals and token programs from authoritative on-chain data.
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

  // Resolve the seed price (quote per base): explicit initialPrice, else live market price.
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
  logger.info(`Initializing PancakeSwap CLMM pool at ${seedPrice} ${quoteToken}/${baseToken} [${seedSource}]`);

  // Canonical mint ordering: the program requires mint0 < mint1 (byte comparison of pubkeys), and
  // sqrt_price_x64 encodes sqrt(amount_mint1 / amount_mint0). We therefore sort the mints, then express
  // the price as mint1-per-mint0. seedPrice is quote-per-base:
  //   - if base sorts first (mint0=base, mint1=quote): mint1/mint0 = quote/base = seedPrice
  //   - if quote sorts first (mint0=quote, mint1=base): mint1/mint0 = base/quote = 1/seedPrice
  const baseIsMint0 = compareBytes(baseMint.toBuffer(), quoteMint.toBuffer()) < 0;
  const mint0 = baseIsMint0 ? baseMint : quoteMint;
  const mint1 = baseIsMint0 ? quoteMint : baseMint;
  const decimals0 = baseIsMint0 ? baseDecimals : quoteDecimals;
  const decimals1 = baseIsMint0 ? quoteDecimals : baseDecimals;
  const program0 = baseIsMint0 ? baseProgram : quoteProgram;
  const program1 = baseIsMint0 ? quoteProgram : baseProgram;
  const priceMint1PerMint0 = baseIsMint0 ? seedPrice : 1 / seedPrice;

  // sqrt_price_x64 = sqrt(raw mint1/mint0) * 2^64. priceToSqrtPriceX64(price, decimalDiff) divides the
  // human price by 10^decimalDiff to recover the raw ratio before sqrt. Since
  //   human(mint1/mint0) = raw(mint1/mint0) * 10^(decimals0 - decimals1),
  // the correct decimalDiff is (decimals0 - decimals1). Verified against getClmmPoolInfo/sqrtPriceX64ToPrice,
  // which inverts this exact relationship (adjustedPrice = rawPrice * 10^(decimals0 - decimals1)).
  const sqrtPriceX64 = priceToSqrtPriceX64(priceMint1PerMint0, decimals0 - decimals1);

  const { instruction, poolState } = buildCreatePoolInstruction(
    new PublicKey(walletAddress),
    ammConfigPubkey,
    mint0,
    mint1,
    program0,
    program1,
    sqrtPriceX64,
    new BN(0), // open_time = 0 → pool opens immediately
  );
  const poolAddress = poolState.toBase58();

  // Fail fast if the pool already exists (same amm_config + mint pair → same PDA).
  const existing = await solana.connection.getAccountInfo(poolState);
  if (existing) {
    throw httpErrors.badRequest(`Pool already exists for this amm_config and token pair: ${poolAddress}`);
  }

  logger.info(`Creating PancakeSwap CLMM pool ${poolAddress} (${baseToken}/${quoteToken})`);

  const walletPubkey = new PublicKey(walletAddress);
  const wallet = await solana.getWallet(walletAddress);

  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  const transaction = await buildTransactionWithInstructions(
    solana,
    walletPubkey,
    [instruction],
    600000,
    priorityFeePerCU,
  );
  transaction.sign([wallet]);

  await solana.simulateWithErrorHandling(transaction);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
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

  // A landed-but-failed transaction is terminal: fail loudly instead of returning
  // PENDING (callers would poll forever). Genuinely-not-landed keeps the pending shape.
  await solana.throwIfLandedWithError(signature, txData);

  return { signature, status: 0, poolAddress, price: seedPrice }; // PENDING
}

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapSolClmmCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description:
          'Create and initialize a new PancakeSwap Solana CLMM pool at an initial price. Does not open or seed a position.',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          walletAddress,
          baseToken,
          quoteToken,
          initialPrice,
          ammConfigIndex,
        } = request.body;
        return await createPool(network, walletAddress!, baseToken, quoteToken, initialPrice, ammConfigIndex);
      } catch (e: any) {
        logger.error('Create pool error:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError(e.message || 'Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;

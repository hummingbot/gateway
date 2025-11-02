import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  PriceMath,
  TickUtil,
  WhirlpoolIx,
  increaseLiquidityQuoteByInputTokenWithParams,
} from '@orca-so/whirlpools-sdk';
import type { WhirlpoolContext } from '@orca-so/whirlpools-sdk';
import { TokenExtensionUtil } from '@orca-so/whirlpools-sdk/dist/utils/public/token-extension-util';
import { Static } from '@sinclair/typebox';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmOpenPositionRequest } from '../schemas';

/**
 * Initialize tick arrays if they don't exist
 */
async function initializeTickArrays(
  builder: TransactionBuilder,
  ctx: WhirlpoolContext,
  whirlpool: { tickSpacing: number },
  whirlpoolPubkey: PublicKey,
  lowerTickIndex: number,
  upperTickIndex: number,
): Promise<void> {
  const lowerTickArrayPda = PDAUtil.getTickArrayFromTickIndex(
    lowerTickIndex,
    whirlpool.tickSpacing,
    whirlpoolPubkey,
    ORCA_WHIRLPOOL_PROGRAM_ID,
  );
  const upperTickArrayPda = PDAUtil.getTickArrayFromTickIndex(
    upperTickIndex,
    whirlpool.tickSpacing,
    whirlpoolPubkey,
    ORCA_WHIRLPOOL_PROGRAM_ID,
  );

  const lowerTickArray = await ctx.fetcher.getTickArray(lowerTickArrayPda.publicKey);
  const upperTickArray = await ctx.fetcher.getTickArray(upperTickArrayPda.publicKey);

  if (!lowerTickArray) {
    builder.addInstruction(
      WhirlpoolIx.initDynamicTickArrayIx(ctx.program, {
        whirlpool: whirlpoolPubkey,
        funder: ctx.wallet.publicKey,
        startTick: TickUtil.getStartTickIndex(lowerTickIndex, whirlpool.tickSpacing),
        tickArrayPda: lowerTickArrayPda,
      }),
    );
  }

  if (!upperTickArray && !upperTickArrayPda.publicKey.equals(lowerTickArrayPda.publicKey)) {
    builder.addInstruction(
      WhirlpoolIx.initDynamicTickArrayIx(ctx.program, {
        whirlpool: whirlpoolPubkey,
        funder: ctx.wallet.publicKey,
        startTick: TickUtil.getStartTickIndex(upperTickIndex, whirlpool.tickSpacing),
        tickArrayPda: upperTickArrayPda,
      }),
    );
  }
}

/**
 * Add liquidity instructions to an open position transaction
 */
async function addLiquidityInstructions(
  builder: TransactionBuilder,
  ctx: WhirlpoolContext,
  whirlpool: any,
  whirlpoolPubkey: PublicKey,
  positionPda: { publicKey: PublicKey },
  positionMintKeypair: Keypair,
  mintA: any,
  mintB: any,
  lowerTickIndex: number,
  upperTickIndex: number,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippage: number,
): Promise<{ baseTokenAmountAdded: number; quoteTokenAmountAdded: number }> {
  // Determine which token to use as input (prefer base if both provided)
  const useBaseToken = baseTokenAmount > 0;
  const inputTokenAmount = useBaseToken ? baseTokenAmount : quoteTokenAmount;
  const inputTokenMint = useBaseToken ? whirlpool.tokenMintA : whirlpool.tokenMintB;
  const inputTokenDecimals = useBaseToken ? mintA.decimals : mintB.decimals;

  // Convert input amount to BN
  const amount = new BN(Math.floor(inputTokenAmount * Math.pow(10, inputTokenDecimals)));

  // Get increase liquidity quote
  const quote = increaseLiquidityQuoteByInputTokenWithParams({
    inputTokenAmount: amount,
    inputTokenMint,
    sqrtPrice: whirlpool.sqrtPrice,
    tickCurrentIndex: whirlpool.tickCurrentIndex,
    tickLowerIndex: lowerTickIndex,
    tickUpperIndex: upperTickIndex,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool),
    tokenMintA: whirlpool.tokenMintA,
    tokenMintB: whirlpool.tokenMintB,
    slippageTolerance: Percentage.fromDecimal(new Decimal(slippage)),
  });

  const baseTokenAmountAdded = Number(quote.tokenEstA) / Math.pow(10, mintA.decimals);
  const quoteTokenAmountAdded = Number(quote.tokenEstB) / Math.pow(10, mintB.decimals);

  logger.info(
    `Adding liquidity: ${baseTokenAmountAdded.toFixed(6)} tokenA, ${quoteTokenAmountAdded.toFixed(6)} tokenB`,
  );

  // Get token accounts
  const tokenOwnerAccountA = getAssociatedTokenAddressSync(
    whirlpool.tokenMintA,
    ctx.wallet.publicKey,
    undefined,
    mintA.tokenProgram,
  );
  const tokenOwnerAccountB = getAssociatedTokenAddressSync(
    whirlpool.tokenMintB,
    ctx.wallet.publicKey,
    undefined,
    mintB.tokenProgram,
  );

  // Handle WSOL wrapping if needed
  await handleWsolAta(
    builder,
    ctx,
    whirlpool.tokenMintA,
    tokenOwnerAccountA,
    mintA.tokenProgram,
    'wrap',
    quote.tokenMaxA,
  );
  await handleWsolAta(
    builder,
    ctx,
    whirlpool.tokenMintB,
    tokenOwnerAccountB,
    mintB.tokenProgram,
    'wrap',
    quote.tokenMaxB,
  );

  // Get tick array pubkeys for the position
  const { lower: lowerTickArrayPubkey, upper: upperTickArrayPubkey } = getTickArrayPubkeys(
    { tickLowerIndex: lowerTickIndex, tickUpperIndex: upperTickIndex },
    whirlpool,
    whirlpoolPubkey,
  );

  // Add increase liquidity instruction
  builder.addInstruction(
    WhirlpoolIx.increaseLiquidityV2Ix(ctx.program, {
      liquidityAmount: quote.liquidityAmount,
      tokenMaxA: quote.tokenMaxA,
      tokenMaxB: quote.tokenMaxB,
      whirlpool: whirlpoolPubkey,
      position: positionPda.publicKey,
      positionAuthority: ctx.wallet.publicKey,
      positionTokenAccount: getAssociatedTokenAddressSync(positionMintKeypair.publicKey, ctx.wallet.publicKey),
      tokenMintA: whirlpool.tokenMintA,
      tokenMintB: whirlpool.tokenMintB,
      tokenProgramA: mintA.tokenProgram,
      tokenProgramB: mintB.tokenProgram,
      tokenOwnerAccountA,
      tokenOwnerAccountB,
      tokenVaultA: whirlpool.tokenVaultA,
      tokenVaultB: whirlpool.tokenVaultB,
      tickArrayLower: lowerTickArrayPubkey,
      tickArrayUpper: upperTickArrayPubkey,
    }),
  );

  return { baseTokenAmountAdded, quoteTokenAmountAdded };
}

async function openPosition(
  fastify: FastifyInstance,
  network: string,
  address: string,
  poolAddress: string,
  lowerPrice: number,
  upperPrice: number,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
  // Validate prices
  if (lowerPrice >= upperPrice) {
    throw fastify.httpErrors.badRequest('lowerPrice must be less than upperPrice');
  }

  // Check if liquidity should be added
  const shouldAddLiquidity = (baseTokenAmount && baseTokenAmount > 0) || (quoteTokenAmount && quoteTokenAmount > 0);
  const slippage = slippagePct || 1; // Default 1% slippage

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);
  const ctx = await orca.getWhirlpoolContextForWallet(address);
  const whirlpoolPubkey = new PublicKey(poolAddress);

  // Fetch whirlpool data
  const whirlpool = await ctx.fetcher.getPool(whirlpoolPubkey);
  if (!whirlpool) {
    throw fastify.httpErrors.notFound(`Whirlpool not found: ${poolAddress}`);
  }

  // Fetch token mint info
  const mintA = await ctx.fetcher.getMintInfo(whirlpool.tokenMintA);
  const mintB = await ctx.fetcher.getMintInfo(whirlpool.tokenMintB);
  if (!mintA || !mintB) {
    throw fastify.httpErrors.notFound('Token mint not found');
  }

  // Convert prices to initializable tick indices
  const lowerTickIndex = PriceMath.priceToInitializableTickIndex(
    new Decimal(lowerPrice),
    mintA.decimals,
    mintB.decimals,
    whirlpool.tickSpacing,
  );
  const upperTickIndex = PriceMath.priceToInitializableTickIndex(
    new Decimal(upperPrice),
    mintA.decimals,
    mintB.decimals,
    whirlpool.tickSpacing,
  );

  // Validate tick indices
  if (lowerTickIndex >= upperTickIndex) {
    throw fastify.httpErrors.badRequest('Calculated tick indices are invalid (lower >= upper)');
  }

  // Build transaction
  const builder = new TransactionBuilder(ctx.connection, ctx.wallet);

  // Initialize tick arrays if needed
  await initializeTickArrays(builder, ctx, whirlpool, whirlpoolPubkey, lowerTickIndex, upperTickIndex);

  // Generate position mint keypair
  const positionMintKeypair = Keypair.generate();
  const positionPda = PDAUtil.getPosition(ORCA_WHIRLPOOL_PROGRAM_ID, positionMintKeypair.publicKey);

  // Always use TOKEN_PROGRAM with metadata (standard Orca positions)
  // Position NFT token program is independent of pool's token programs
  const metadataPda = PDAUtil.getPositionMetadata(positionMintKeypair.publicKey);
  builder.addInstruction(
    WhirlpoolIx.openPositionWithMetadataIx(ctx.program, {
      funder: ctx.wallet.publicKey,
      whirlpool: whirlpoolPubkey,
      tickLowerIndex: lowerTickIndex,
      tickUpperIndex: upperTickIndex,
      owner: ctx.wallet.publicKey,
      positionMintAddress: positionMintKeypair.publicKey,
      positionPda,
      positionTokenAccount: getAssociatedTokenAddressSync(positionMintKeypair.publicKey, ctx.wallet.publicKey),
      metadataPda,
    }),
  );

  builder.addSigner(positionMintKeypair);

  // Add liquidity if amounts are provided
  let baseTokenAmountAdded = 0;
  let quoteTokenAmountAdded = 0;

  if (shouldAddLiquidity) {
    const result = await addLiquidityInstructions(
      builder,
      ctx,
      whirlpool,
      whirlpoolPubkey,
      positionPda,
      positionMintKeypair,
      mintA,
      mintB,
      lowerTickIndex,
      upperTickIndex,
      baseTokenAmount || 0,
      quoteTokenAmount || 0,
      slippage,
    );
    baseTokenAmountAdded = result.baseTokenAmountAdded;
    quoteTokenAmountAdded = result.quoteTokenAmountAdded;
  }

  // Build, simulate, and send transaction
  const txPayload = await builder.build();
  await solana.simulateWithErrorHandling(txPayload.transaction, fastify);
  const { signature, fee } = await solana.sendAndConfirmTransaction(txPayload.transaction, [
    wallet,
    positionMintKeypair,
  ]);

  const positionRent = 0.00203928; // Standard position account rent

  if (shouldAddLiquidity) {
    logger.info(
      `Position created at ${positionPda.publicKey.toString()} with liquidity: ${baseTokenAmountAdded.toFixed(6)} tokenA, ${quoteTokenAmountAdded.toFixed(6)} tokenB`,
    );
  } else {
    logger.info(
      `Position created successfully at ${positionPda.publicKey.toString()}. Use addLiquidity to deposit tokens.`,
    );
  }

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      positionAddress: positionPda.publicKey.toString(),
      positionRent,
      baseTokenAmountAdded,
      quoteTokenAmountAdded,
    },
  };
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, poolAddress, lowerPrice, upperPrice, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;
        const network = request.body.network;

        return await openPosition(
          fastify,
          network,
          walletAddress,
          poolAddress,
          lowerPrice,
          upperPrice,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default openPositionRoute;

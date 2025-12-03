import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  PriceMath,
  TickUtil,
  WhirlpoolIx,
  increaseLiquidityQuoteByInputTokenWithParams,
  TokenExtensionUtil,
  WhirlpoolClient,
  Whirlpool,
  IGNORE_CACHE,
} from '@orca-so/whirlpools-sdk';
import { Static } from '@sinclair/typebox';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmOpenPositionRequest } from '../schemas';

/**
 * Initialize tick arrays if they don't exist
 */
async function initializeTickArrays(
  builder: TransactionBuilder,
  client: WhirlpoolClient,
  whirlpool: Whirlpool,
  whirlpoolPubkey: PublicKey,
  lowerTickIndex: number,
  upperTickIndex: number,
): Promise<void> {
  await whirlpool.refreshData();

  const lowerTickArrayPda = PDAUtil.getTickArrayFromTickIndex(
    lowerTickIndex,
    whirlpool.getData().tickSpacing,
    whirlpoolPubkey,
    ORCA_WHIRLPOOL_PROGRAM_ID,
  );
  const upperTickArrayPda = PDAUtil.getTickArrayFromTickIndex(
    upperTickIndex,
    whirlpool.getData().tickSpacing,
    whirlpoolPubkey,
    ORCA_WHIRLPOOL_PROGRAM_ID,
  );

  const lowerTickArray = await client.getFetcher().getTickArray(lowerTickArrayPda.publicKey);
  const upperTickArray = await client.getFetcher().getTickArray(upperTickArrayPda.publicKey);

  if (!lowerTickArray) {
    builder.addInstruction(
      WhirlpoolIx.initDynamicTickArrayIx(client.getContext().program, {
        whirlpool: whirlpoolPubkey,
        funder: client.getContext().wallet.publicKey,
        startTick: TickUtil.getStartTickIndex(lowerTickIndex, whirlpool.getData().tickSpacing),
        tickArrayPda: lowerTickArrayPda,
      }),
    );
  }

  if (!upperTickArray && !upperTickArrayPda.publicKey.equals(lowerTickArrayPda.publicKey)) {
    builder.addInstruction(
      WhirlpoolIx.initDynamicTickArrayIx(client.getContext().program, {
        whirlpool: whirlpoolPubkey,
        funder: client.getContext().wallet.publicKey,
        startTick: TickUtil.getStartTickIndex(upperTickIndex, whirlpool.getData().tickSpacing),
        tickArrayPda: upperTickArrayPda,
      }),
    );
  }
}

/**
 * Add liquidity instructions to an open position transaction
 * @param quote - Pre-calculated liquidity quote (calculated in openPosition to avoid redundancy)
 */
async function addLiquidityInstructions(
  builder: TransactionBuilder,
  client: WhirlpoolClient,
  whirlpool: Whirlpool,
  whirlpoolPubkey: PublicKey,
  positionPda: { publicKey: PublicKey },
  positionMintKeypair: Keypair,
  mintA: any,
  mintB: any,
  lowerTickIndex: number,
  upperTickIndex: number,
  quote: any,
): Promise<{ baseTokenAmountAdded: number; quoteTokenAmountAdded: number }> {
  const baseTokenAmountAdded = Number(quote.tokenEstA) / Math.pow(10, mintA.decimals);
  const quoteTokenAmountAdded = Number(quote.tokenEstB) / Math.pow(10, mintB.decimals);

  logger.info(
    `Adding liquidity: ${baseTokenAmountAdded.toFixed(6)} tokenA, ${quoteTokenAmountAdded.toFixed(6)} tokenB`,
  );

  // Get token accounts
  const tokenOwnerAccountA = getAssociatedTokenAddressSync(
    whirlpool.getTokenAInfo().address,
    client.getContext().wallet.publicKey,
    undefined,
    mintA.tokenProgram,
  );
  const tokenOwnerAccountB = getAssociatedTokenAddressSync(
    whirlpool.getTokenBInfo().address,
    client.getContext().wallet.publicKey,
    undefined,
    mintB.tokenProgram,
  );

  // Get tick array pubkeys for the position
  const { lower: lowerTickArrayPubkey, upper: upperTickArrayPubkey } = getTickArrayPubkeys(
    { tickLowerIndex: lowerTickIndex, tickUpperIndex: upperTickIndex },
    whirlpool.getData(),
    whirlpoolPubkey,
  );

  // Add increase liquidity instruction
  builder.addInstruction(
    WhirlpoolIx.increaseLiquidityV2Ix(client.getContext().program, {
      liquidityAmount: quote.liquidityAmount,
      tokenMaxA: quote.tokenMaxA,
      tokenMaxB: quote.tokenMaxB,
      whirlpool: whirlpoolPubkey,
      position: positionPda.publicKey,
      positionAuthority: client.getContext().wallet.publicKey,
      positionTokenAccount: getAssociatedTokenAddressSync(
        positionMintKeypair.publicKey,
        client.getContext().wallet.publicKey,
      ),
      tokenMintA: whirlpool.getTokenAInfo().address,
      tokenMintB: whirlpool.getTokenBInfo().address,
      tokenProgramA: mintA.tokenProgram,
      tokenProgramB: mintB.tokenProgram,
      tokenOwnerAccountA,
      tokenOwnerAccountB,
      tokenVaultA: whirlpool.getTokenVaultAInfo().address,
      tokenVaultB: whirlpool.getTokenVaultBInfo().address,
      tickArrayLower: lowerTickArrayPubkey,
      tickArrayUpper: upperTickArrayPubkey,
    }),
  );

  return { baseTokenAmountAdded, quoteTokenAmountAdded };
}

export async function openPosition(
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
    throw httpErrors.badRequest('lowerPrice must be less than upperPrice');
  }

  // Check if liquidity should be added
  const shouldAddLiquidity = (baseTokenAmount && baseTokenAmount > 0) || (quoteTokenAmount && quoteTokenAmount > 0);
  const slippage = slippagePct || 1; // Default 1% slippage

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);
  const client = await orca.getWhirlpoolClientForWallet(address);
  const whirlpoolPubkey = new PublicKey(poolAddress);

  // Fetch whirlpool data
  const whirlpool = await client.getPool(whirlpoolPubkey, IGNORE_CACHE);
  if (!whirlpool) {
    throw httpErrors.notFound(`Whirlpool not found: ${poolAddress}`);
  }

  await whirlpool.refreshData();

  // Fetch token mint info
  const mintA = await client.getFetcher().getMintInfo(whirlpool.getTokenAInfo().address);
  const mintB = await client.getFetcher().getMintInfo(whirlpool.getTokenBInfo().address);
  if (!mintA || !mintB) {
    throw httpErrors.notFound('Token mint not found');
  }

  // Convert prices to initializable tick indices
  const lowerTickIndex = PriceMath.priceToInitializableTickIndex(
    new Decimal(lowerPrice),
    mintA.decimals,
    mintB.decimals,
    whirlpool.getData().tickSpacing,
  );
  const upperTickIndex = PriceMath.priceToInitializableTickIndex(
    new Decimal(upperPrice),
    mintA.decimals,
    mintB.decimals,
    whirlpool.getData().tickSpacing,
  );

  // Validate tick indices
  if (lowerTickIndex >= upperTickIndex) {
    throw httpErrors.badRequest('Calculated tick indices are invalid (lower >= upper)');
  }

  // Build transaction
  const builder = new TransactionBuilder(client.getContext().connection, client.getContext().wallet);

  // Initialize tick arrays if needed
  await initializeTickArrays(builder, client, whirlpool, whirlpoolPubkey, lowerTickIndex, upperTickIndex);

  // If we're adding liquidity, prepare WSOL wrapping FIRST (before opening position)
  let baseTokenAmountAdded = 0;
  let quoteTokenAmountAdded = 0;
  let quote: any;

  if (shouldAddLiquidity) {
    // Calculate liquidity quote to know how much WSOL we need
    // Use the same logic as addLiquidityInstructions to respect both token limits
    const tokenExtensionCtx = await TokenExtensionUtil.buildTokenExtensionContext(
      client.getFetcher(),
      whirlpool.getData(),
    );
    const slippageTolerance = Percentage.fromDecimal(new Decimal(slippage));

    // If both amounts provided, get quotes for both scenarios and pick the valid one
    if (baseTokenAmount && baseTokenAmount > 0 && quoteTokenAmount && quoteTokenAmount > 0) {
      const baseAmount = new BN(Math.floor(baseTokenAmount * Math.pow(10, mintA.decimals)));
      const quoteFromBase = increaseLiquidityQuoteByInputTokenWithParams({
        inputTokenAmount: baseAmount,
        inputTokenMint: whirlpool.getTokenAInfo().address,
        sqrtPrice: whirlpool.getData().sqrtPrice,
        tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
        tickLowerIndex: lowerTickIndex,
        tickUpperIndex: upperTickIndex,
        tokenExtensionCtx,
        tokenMintA: whirlpool.getTokenAInfo().address,
        tokenMintB: whirlpool.getTokenBInfo().address,
        slippageTolerance,
      });

      const quoteAmount = new BN(Math.floor(quoteTokenAmount * Math.pow(10, mintB.decimals)));
      const quoteFromQuote = increaseLiquidityQuoteByInputTokenWithParams({
        inputTokenAmount: quoteAmount,
        inputTokenMint: whirlpool.getTokenBInfo().address,
        sqrtPrice: whirlpool.getData().sqrtPrice,
        tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
        tickLowerIndex: lowerTickIndex,
        tickUpperIndex: upperTickIndex,
        tokenExtensionCtx,
        tokenMintA: whirlpool.getTokenAInfo().address,
        tokenMintB: whirlpool.getTokenBInfo().address,
        slippageTolerance,
      });

      // Pick the quote with LESS liquidity to respect both token limits
      // This matches quotePosition logic and ensures we never exceed user's provided amounts
      const baseLiquidity = quoteFromBase.liquidityAmount;
      const quoteLiquidity = quoteFromQuote.liquidityAmount;
      const baseLimited = baseLiquidity.lt(quoteLiquidity);

      quote = baseLimited ? quoteFromBase : quoteFromQuote;
    } else {
      // Only one amount provided
      const useBaseToken = (baseTokenAmount || 0) > 0;
      const inputTokenAmount = useBaseToken ? baseTokenAmount! : quoteTokenAmount!;
      const inputTokenMint = useBaseToken ? whirlpool.getTokenAInfo().address : whirlpool.getTokenBInfo().address;
      const inputTokenDecimals = useBaseToken ? mintA.decimals : mintB.decimals;
      const amount = new BN(Math.floor(inputTokenAmount * Math.pow(10, inputTokenDecimals)));

      quote = increaseLiquidityQuoteByInputTokenWithParams({
        inputTokenAmount: amount,
        inputTokenMint,
        sqrtPrice: whirlpool.getData().sqrtPrice,
        tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
        tickLowerIndex: lowerTickIndex,
        tickUpperIndex: upperTickIndex,
        tokenExtensionCtx,
        tokenMintA: whirlpool.getTokenAInfo().address,
        tokenMintB: whirlpool.getTokenBInfo().address,
        slippageTolerance,
      });
    }

    baseTokenAmountAdded = Number(quote.tokenEstA) / Math.pow(10, mintA.decimals);
    quoteTokenAmountAdded = Number(quote.tokenEstB) / Math.pow(10, mintB.decimals);

    logger.info(
      `Will add liquidity: ${baseTokenAmountAdded.toFixed(6)} tokenA, ${quoteTokenAmountAdded.toFixed(6)} tokenB`,
    );

    // Get token accounts
    const tokenOwnerAccountA = getAssociatedTokenAddressSync(
      whirlpool.getTokenAInfo().address,
      client.getContext().wallet.publicKey,
      undefined,
      mintA.tokenProgram,
    );
    const tokenOwnerAccountB = getAssociatedTokenAddressSync(
      whirlpool.getTokenBInfo().address,
      client.getContext().wallet.publicKey,
      undefined,
      mintB.tokenProgram,
    );

    // Wrap WSOL FIRST, before opening position
    // Add buffer for rent costs (position rent + metadata rent + ATA rent)
    const RENT_BUFFER_LAMPORTS = 5000000; // ~0.005 SOL buffer for various rent costs

    logger.info(
      `Pre-wrapping WSOL - TokenA max: ${quote.tokenMaxA.toString()}, TokenB max: ${quote.tokenMaxB.toString()}`,
    );

    // Add rent buffer to WSOL wrapping amounts if WSOL is one of the tokens
    const tokenMaxAWithBuffer =
      whirlpool.getTokenAInfo().address.toString() === 'So11111111111111111111111111111111111111112'
        ? quote.tokenMaxA.add(new BN(RENT_BUFFER_LAMPORTS))
        : quote.tokenMaxA;
    const tokenMaxBWithBuffer =
      whirlpool.getTokenBInfo().address.toString() === 'So11111111111111111111111111111111111111112'
        ? quote.tokenMaxB.add(new BN(RENT_BUFFER_LAMPORTS))
        : quote.tokenMaxB;

    logger.info(
      `With rent buffer - TokenA: ${tokenMaxAWithBuffer.toString()}, TokenB: ${tokenMaxBWithBuffer.toString()}`,
    );

    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenAInfo().address,
      tokenOwnerAccountA,
      mintA.tokenProgram,
      'wrap',
      tokenMaxAWithBuffer,
      solana,
    );
    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenBInfo().address,
      tokenOwnerAccountB,
      mintB.tokenProgram,
      'wrap',
      tokenMaxBWithBuffer,
      solana,
    );

    logger.info('WSOL pre-wrapping completed');
  }

  // Generate position mint keypair
  const positionMintKeypair = Keypair.generate();
  const positionPda = PDAUtil.getPosition(ORCA_WHIRLPOOL_PROGRAM_ID, positionMintKeypair.publicKey);

  // Always use TOKEN_PROGRAM with metadata (standard Orca positions)
  // Position NFT token program is independent of pool's token programs
  const metadataPda = PDAUtil.getPositionMetadata(positionMintKeypair.publicKey);
  builder.addInstruction(
    WhirlpoolIx.openPositionWithMetadataIx(client.getContext().program, {
      funder: client.getContext().wallet.publicKey,
      whirlpool: whirlpoolPubkey,
      tickLowerIndex: lowerTickIndex,
      tickUpperIndex: upperTickIndex,
      owner: client.getContext().wallet.publicKey,
      positionMintAddress: positionMintKeypair.publicKey,
      positionPda,
      positionTokenAccount: getAssociatedTokenAddressSync(
        positionMintKeypair.publicKey,
        client.getContext().wallet.publicKey,
      ),
      metadataPda,
    }),
  );

  builder.addSigner(positionMintKeypair);

  // Add liquidity instructions (WSOL already wrapped above, quote already calculated)
  if (shouldAddLiquidity) {
    const result = await addLiquidityInstructions(
      builder,
      client,
      whirlpool,
      whirlpoolPubkey,
      positionPda,
      positionMintKeypair,
      mintA,
      mintB,
      lowerTickIndex,
      upperTickIndex,
      quote!,
    );
    baseTokenAmountAdded = result.baseTokenAmountAdded;
    quoteTokenAmountAdded = result.quoteTokenAmountAdded;

    // Auto-unwrap any leftover WSOL (from rent buffer + slippage savings)
    logger.info('Auto-unwrapping leftover WSOL (if any) back to native SOL');
    const tokenOwnerAccountA = getAssociatedTokenAddressSync(
      whirlpool.getTokenAInfo().address,
      client.getContext().wallet.publicKey,
      undefined,
      mintA.tokenProgram,
    );
    const tokenOwnerAccountB = getAssociatedTokenAddressSync(
      whirlpool.getTokenBInfo().address,
      client.getContext().wallet.publicKey,
      undefined,
      mintB.tokenProgram,
    );

    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenAInfo().address,
      tokenOwnerAccountA,
      mintA.tokenProgram,
      'unwrap',
      undefined,
      solana,
    );
    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenBInfo().address,
      tokenOwnerAccountB,
      mintB.tokenProgram,
      'unwrap',
      undefined,
      solana,
    );
  }

  // Build, simulate, and send transaction
  const txPayload = await builder.build();
  await solana.simulateWithErrorHandling(txPayload.transaction);
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
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default openPositionRoute;

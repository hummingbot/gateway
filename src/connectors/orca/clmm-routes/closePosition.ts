import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  TickArrayUtil,
  WhirlpoolIx,
  collectFeesQuote,
  decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil,
} from '@orca-so/whirlpools-sdk';
import { Static } from '@sinclair/typebox';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponse, ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmClosePositionRequest } from '../schemas';

async function closePosition(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);
  const ctx = await orca.getWhirlpoolContextForWallet(address);
  const positionPubkey = new PublicKey(positionAddress);

  // Fetch position data
  const position = await ctx.fetcher.getPosition(positionPubkey);
  if (!position) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const positionMint = await ctx.fetcher.getMintInfo(position.positionMint);
  if (!positionMint) {
    throw fastify.httpErrors.notFound(`Position mint not found: ${position.positionMint.toString()}`);
  }

  // Fetch whirlpool data
  const whirlpoolPubkey = position.whirlpool;
  const whirlpool = await ctx.fetcher.getPool(whirlpoolPubkey);
  if (!whirlpool) {
    throw fastify.httpErrors.notFound(`Whirlpool not found: ${whirlpoolPubkey.toString()}`);
  }

  // Fetch token mint info
  const mintA = await ctx.fetcher.getMintInfo(whirlpool.tokenMintA);
  const mintB = await ctx.fetcher.getMintInfo(whirlpool.tokenMintB);
  if (!mintA || !mintB) {
    throw fastify.httpErrors.notFound('Token mint not found');
  }

  // Build transaction
  const builder = new TransactionBuilder(ctx.connection, ctx.wallet);

  // Get token owner accounts (ATAs)
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

  // Ensure ATAs exist for receiving tokens
  await handleWsolAta(builder, ctx, whirlpool.tokenMintA, tokenOwnerAccountA, mintA.tokenProgram, 'receive');
  await handleWsolAta(builder, ctx, whirlpool.tokenMintB, tokenOwnerAccountB, mintB.tokenProgram, 'receive');

  const hasLiquidity = !position.liquidity.isZero();
  const hasFees = !position.feeOwedA.isZero() || !position.feeOwedB.isZero();

  let baseTokenAmountRemoved = 0;
  let quoteTokenAmountRemoved = 0;
  let baseFeeAmountCollected = 0;
  let quoteFeeAmountCollected = 0;

  // Step 1: Update fees and rewards if position has liquidity (must be done BEFORE removing liquidity)
  if (hasLiquidity) {
    const { lower, upper } = getTickArrayPubkeys(position, whirlpool, whirlpoolPubkey);
    builder.addInstruction(
      WhirlpoolIx.updateFeesAndRewardsIx(ctx.program, {
        position: positionPubkey,
        tickArrayLower: lower,
        tickArrayUpper: upper,
        whirlpool: whirlpoolPubkey,
      }),
    );
  }

  // Step 2: Remove liquidity if position has liquidity
  if (hasLiquidity) {
    const decreaseQuote = decreaseLiquidityQuoteByLiquidityWithParams({
      liquidity: position.liquidity,
      sqrtPrice: whirlpool.sqrtPrice,
      tickCurrentIndex: whirlpool.tickCurrentIndex,
      tickLowerIndex: position.tickLowerIndex,
      tickUpperIndex: position.tickUpperIndex,
      tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool),
      slippageTolerance: Percentage.fromDecimal(new Decimal(50)),
    });

    const { lower, upper } = getTickArrayPubkeys(position, whirlpool, whirlpoolPubkey);
    builder.addInstruction(
      WhirlpoolIx.decreaseLiquidityV2Ix(ctx.program, {
        liquidityAmount: decreaseQuote.liquidityAmount,
        tokenMinA: decreaseQuote.tokenMinA,
        tokenMinB: decreaseQuote.tokenMinB,
        position: positionPubkey,
        positionAuthority: ctx.wallet.publicKey,
        tokenMintA: whirlpool.tokenMintA,
        tokenMintB: whirlpool.tokenMintB,
        positionTokenAccount: getAssociatedTokenAddressSync(
          position.positionMint,
          ctx.wallet.publicKey,
          undefined,
          positionMint.tokenProgram,
        ),
        tickArrayLower: lower,
        tickArrayUpper: upper,
        tokenOwnerAccountA,
        tokenOwnerAccountB,
        tokenProgramA: mintA.tokenProgram,
        tokenProgramB: mintB.tokenProgram,
        tokenVaultA: whirlpool.tokenVaultA,
        tokenVaultB: whirlpool.tokenVaultB,
        whirlpool: whirlpoolPubkey,
        tokenTransferHookAccountsA: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          ctx.provider.connection,
          mintA,
          tokenOwnerAccountA,
          whirlpool.tokenVaultA,
          ctx.wallet.publicKey,
        ),
        tokenTransferHookAccountsB: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          ctx.provider.connection,
          mintB,
          tokenOwnerAccountB,
          whirlpool.tokenVaultB,
          ctx.wallet.publicKey,
        ),
      }),
    );

    baseTokenAmountRemoved = Number(decreaseQuote.tokenEstA) / Math.pow(10, mintA.decimals);
    quoteTokenAmountRemoved = Number(decreaseQuote.tokenEstB) / Math.pow(10, mintB.decimals);
  }

  // Step 3: Collect fees if there are fees owed or if we just removed liquidity
  if (hasFees || hasLiquidity) {
    const { lower, upper } = getTickArrayPubkeys(position, whirlpool, whirlpoolPubkey);
    const lowerTickArray = await ctx.fetcher.getTickArray(lower);
    const upperTickArray = await ctx.fetcher.getTickArray(upper);
    if (!lowerTickArray || !upperTickArray) {
      throw fastify.httpErrors.notFound('Tick array not found');
    }

    const collectQuote = collectFeesQuote({
      position,
      tickLower: TickArrayUtil.getTickFromArray(lowerTickArray, position.tickLowerIndex, whirlpool.tickSpacing),
      tickUpper: TickArrayUtil.getTickFromArray(upperTickArray, position.tickUpperIndex, whirlpool.tickSpacing),
      whirlpool,
      tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool),
    });

    builder.addInstruction(
      WhirlpoolIx.collectFeesV2Ix(ctx.program, {
        position: positionPubkey,
        positionAuthority: ctx.wallet.publicKey,
        tokenMintA: whirlpool.tokenMintA,
        tokenMintB: whirlpool.tokenMintB,
        positionTokenAccount: getAssociatedTokenAddressSync(
          position.positionMint,
          ctx.wallet.publicKey,
          undefined,
          positionMint.tokenProgram,
        ),
        tokenOwnerAccountA,
        tokenOwnerAccountB,
        tokenProgramA: mintA.tokenProgram,
        tokenProgramB: mintB.tokenProgram,
        tokenVaultA: whirlpool.tokenVaultA,
        tokenVaultB: whirlpool.tokenVaultB,
        whirlpool: whirlpoolPubkey,
        tokenTransferHookAccountsA: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          ctx.provider.connection,
          mintA,
          tokenOwnerAccountA,
          whirlpool.tokenVaultA,
          ctx.wallet.publicKey,
        ),
        tokenTransferHookAccountsB: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          ctx.provider.connection,
          mintB,
          tokenOwnerAccountB,
          whirlpool.tokenVaultB,
          ctx.wallet.publicKey,
        ),
      }),
    );

    baseFeeAmountCollected = Number(collectQuote.feeOwedA) / Math.pow(10, mintA.decimals);
    quoteFeeAmountCollected = Number(collectQuote.feeOwedB) / Math.pow(10, mintB.decimals);
  }

  // Step 4: Close position - choose instruction based on token program
  const isToken2022 = positionMint.tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
  const closePositionIxFn = isToken2022 ? WhirlpoolIx.closePositionWithTokenExtensionsIx : WhirlpoolIx.closePositionIx;

  builder.addInstruction(
    closePositionIxFn(ctx.program, {
      position: positionPubkey,
      positionAuthority: ctx.wallet.publicKey,
      positionTokenAccount: getAssociatedTokenAddressSync(
        position.positionMint,
        ctx.wallet.publicKey,
        undefined,
        isToken2022 ? TOKEN_2022_PROGRAM_ID : undefined,
      ),
      positionMint: position.positionMint,
      receiver: ctx.wallet.publicKey,
    }),
  );

  // Build, simulate, and send transaction
  const txPayload = await builder.build();
  await solana.simulateWithErrorHandling(txPayload.transaction, fastify);
  const { signature, fee } = await solana.sendAndConfirmTransaction(txPayload.transaction, [wallet]);

  const positionRentRefunded = 0.00203928;

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      positionRentRefunded,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress } = request.body;
        const network = request.body.network;

        return await closePosition(fastify, network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

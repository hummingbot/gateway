import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import { WhirlpoolIx, decreaseLiquidityQuoteByLiquidityWithParams, TokenExtensionUtil } from '@orca-so/whirlpools-sdk';
import { Static } from '@sinclair/typebox';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmRemoveLiquidityRequest } from '../schemas';

async function removeLiquidity(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
  liquidityPct: number,
  slippagePct: number,
): Promise<RemoveLiquidityResponseType> {
  if (liquidityPct <= 0 || liquidityPct > 100) {
    throw fastify.httpErrors.badRequest('liquidityPct must be between 0 and 100');
  }

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

  // Calculate liquidity amount to remove
  const liquidityAmount = new BN(
    new Decimal(position.liquidity.toString()).mul(liquidityPct).div(100).floor().toString(),
  );

  if (liquidityAmount.isZero() || liquidityAmount.gt(position.liquidity)) {
    throw fastify.httpErrors.badRequest('Invalid liquidity amount calculated');
  }

  // Get decrease liquidity quote
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    liquidity: liquidityAmount,
    sqrtPrice: whirlpool.sqrtPrice,
    tickCurrentIndex: whirlpool.tickCurrentIndex,
    tickLowerIndex: position.tickLowerIndex,
    tickUpperIndex: position.tickUpperIndex,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool),
    slippageTolerance: Percentage.fromDecimal(new Decimal(slippagePct)),
  });

  logger.info(
    `Removing ${liquidityPct}% liquidity, estimated: ${(Number(quote.tokenEstA) / Math.pow(10, mintA.decimals)).toFixed(6)} tokenA, ${(Number(quote.tokenEstB) / Math.pow(10, mintB.decimals)).toFixed(6)} tokenB`,
  );

  // Build transaction
  const builder = new TransactionBuilder(ctx.connection, ctx.wallet);

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

  // Handle WSOL ATAs for receiving withdrawn liquidity
  await handleWsolAta(builder, ctx, whirlpool.tokenMintA, tokenOwnerAccountA, mintA.tokenProgram, 'receive');
  await handleWsolAta(builder, ctx, whirlpool.tokenMintB, tokenOwnerAccountB, mintB.tokenProgram, 'receive');

  const { lower, upper } = getTickArrayPubkeys(position, whirlpool, whirlpoolPubkey);
  builder.addInstruction(
    WhirlpoolIx.decreaseLiquidityV2Ix(ctx.program, {
      liquidityAmount: quote.liquidityAmount,
      tokenMinA: quote.tokenMinA,
      tokenMinB: quote.tokenMinB,
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

  // Build, simulate, and send transaction
  const txPayload = await builder.build();
  await solana.simulateWithErrorHandling(txPayload.transaction, fastify);
  const { signature, fee } = await solana.sendAndConfirmTransaction(txPayload.transaction, [wallet]);

  // Extract removed amounts from balance changes
  const tokenA = await solana.getToken(whirlpool.tokenMintA.toString());
  const tokenB = await solana.getToken(whirlpool.tokenMintB.toString());
  if (!tokenA || !tokenB) {
    throw fastify.httpErrors.notFound('Tokens not found for balance extraction');
  }

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(
    signature,
    ctx.wallet.publicKey.toString(),
    [tokenA.address, tokenB.address],
    true,
  );

  logger.info(
    `Liquidity removed: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA.symbol}, ${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB.symbol}`,
  );

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      baseTokenAmountRemoved: Math.abs(balanceChanges[0]),
      quoteTokenAmountRemoved: Math.abs(balanceChanges[1]),
    },
  };
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, liquidityPct = 100, slippagePct = 1 } = request.body;
        const network = request.body.network;

        return await removeLiquidity(fastify, network, walletAddress, positionAddress, liquidityPct, slippagePct);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

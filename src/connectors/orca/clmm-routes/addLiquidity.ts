import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import { WhirlpoolIx, increaseLiquidityQuoteByInputTokenWithParams } from '@orca-so/whirlpools-sdk';
import { TokenExtensionUtil } from '@orca-so/whirlpools-sdk/dist/utils/public/token-extension-util';
import { Static } from '@sinclair/typebox';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmAddLiquidityRequest } from '../schemas';

async function addLiquidity(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number,
): Promise<AddLiquidityResponseType> {
  // Validate at least one amount is provided
  if ((!baseTokenAmount || baseTokenAmount <= 0) && (!quoteTokenAmount || quoteTokenAmount <= 0)) {
    throw fastify.httpErrors.badRequest('At least one token amount must be provided and greater than 0');
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
    tickLowerIndex: position.tickLowerIndex,
    tickUpperIndex: position.tickUpperIndex,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool),
    tokenMintA: whirlpool.tokenMintA,
    tokenMintB: whirlpool.tokenMintB,
    slippageTolerance: Percentage.fromDecimal(new Decimal(slippagePct)),
  });

  logger.info(
    `Adding liquidity: ${(Number(quote.tokenEstA) / Math.pow(10, mintA.decimals)).toFixed(6)} tokenA, ${(Number(quote.tokenEstB) / Math.pow(10, mintB.decimals)).toFixed(6)} tokenB`,
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

  // Handle WSOL wrapping for tokens (or create regular ATAs)
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

  const { lower, upper } = getTickArrayPubkeys(position, whirlpool, whirlpoolPubkey);
  builder.addInstruction(
    WhirlpoolIx.increaseLiquidityV2Ix(ctx.program, {
      liquidityAmount: quote.liquidityAmount,
      tokenMaxA: quote.tokenMaxA,
      tokenMaxB: quote.tokenMaxB,
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

  // Extract added amounts from balance changes
  const tokenA = await solana.getToken(whirlpool.tokenMintA.toString());
  const tokenB = await solana.getToken(whirlpool.tokenMintB.toString());
  if (!tokenA || !tokenB) {
    throw fastify.httpErrors.notFound('Tokens not found for balance extraction');
  }

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, ctx.wallet.publicKey.toString(), [
    tokenA.address,
    tokenB.address,
  ]);

  logger.info(
    `Liquidity added: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA.symbol}, ${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB.symbol}`,
  );

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      baseTokenAmountAdded: Math.abs(balanceChanges[0]),
      quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
    },
  };
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct = 1 } = request.body;
        const network = request.body.network;

        return await addLiquidity(
          fastify,
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount || 0,
          quoteTokenAmount || 0,
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

export default addLiquidityRoute;

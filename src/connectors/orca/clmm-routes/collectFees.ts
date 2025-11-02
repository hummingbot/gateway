import { TransactionBuilder } from '@orca-so/common-sdk';
import { WhirlpoolIx, collectFeesQuote, TickArrayUtil } from '@orca-so/whirlpools-sdk';
import { TokenExtensionUtil } from '@orca-so/whirlpools-sdk/dist/utils/public/token-extension-util';
import { Static } from '@sinclair/typebox';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmCollectFeesRequest } from '../schemas';

async function collectFees(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);

  // Get whirlpool context for wallet
  const ctx = await orca.getWhirlpoolContextForWallet(address);
  const positionPubkey = new PublicKey(positionAddress);

  // Fetch position data
  const position = await ctx.fetcher.getPosition(positionPubkey);
  if (!position) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  // Fetch position mint info
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

  // Fetch tick arrays
  const { lower: lowerTickArrayPubkey, upper: upperTickArrayPubkey } = getTickArrayPubkeys(
    position,
    whirlpool,
    whirlpoolPubkey,
  );

  const lowerTickArray = await ctx.fetcher.getTickArray(lowerTickArrayPubkey);
  const upperTickArray = await ctx.fetcher.getTickArray(upperTickArrayPubkey);
  if (!lowerTickArray || !upperTickArray) {
    throw fastify.httpErrors.notFound('Tick array not found');
  }

  // Calculate fees quote
  const quote = collectFeesQuote({
    position,
    tickLower: TickArrayUtil.getTickFromArray(lowerTickArray, position.tickLowerIndex, whirlpool.tickSpacing),
    tickUpper: TickArrayUtil.getTickFromArray(upperTickArray, position.tickUpperIndex, whirlpool.tickSpacing),
    whirlpool,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool),
  });

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

  // Handle WSOL ATAs for receiving collected fees
  await handleWsolAta(builder, ctx, whirlpool.tokenMintA, tokenOwnerAccountA, mintA.tokenProgram, 'receive');
  await handleWsolAta(builder, ctx, whirlpool.tokenMintB, tokenOwnerAccountB, mintB.tokenProgram, 'receive');

  // Add updateFeesAndRewardsIx if position has liquidity
  if (position.liquidity.gtn(0)) {
    builder.addInstruction(
      WhirlpoolIx.updateFeesAndRewardsIx(ctx.program, {
        position: positionPubkey,
        tickArrayLower: lowerTickArrayPubkey,
        tickArrayUpper: upperTickArrayPubkey,
        whirlpool: whirlpoolPubkey,
      }),
    );
  }

  // Add collectFeesV2Ix
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

  // Build and simulate transaction
  const txPayload = await builder.build();
  const transaction = txPayload.transaction;
  await solana.simulateWithErrorHandling(transaction, fastify);

  // Send and confirm transaction
  const { signature, fee } = await solana.sendAndConfirmTransaction(transaction, [wallet]);

  // Extract collected fees from balance changes
  const tokenA = await solana.getToken(whirlpool.tokenMintA.toString());
  const tokenB = await solana.getToken(whirlpool.tokenMintB.toString());
  if (!tokenA || !tokenB) {
    throw fastify.httpErrors.notFound('Tokens not found for balance extraction');
  }

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, whirlpoolPubkey.toString(), [
    tokenA.address,
    tokenB.address,
  ]);

  logger.info(
    `Fees collected: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA.symbol}, ${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB.symbol}`,
  );

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      baseFeeAmountCollected: Math.abs(balanceChanges[0]),
      quoteFeeAmountCollected: Math.abs(balanceChanges[1]),
    },
  };
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress } = request.body;
        const network = request.body.network;

        return await collectFees(fastify, network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default collectFeesRoute;

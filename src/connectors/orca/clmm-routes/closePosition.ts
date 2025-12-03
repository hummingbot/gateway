import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  TickArrayUtil,
  WhirlpoolIx,
  collectFeesQuote,
  decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil,
  IGNORE_CACHE,
} from '@orca-so/whirlpools-sdk';
import { Static } from '@sinclair/typebox';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponse, ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmClosePositionRequest } from '../schemas';

export async function closePosition(
  network: string,
  address: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);
  const client = await orca.getWhirlpoolClientForWallet(address);
  const positionPubkey = new PublicKey(positionAddress);

  // Fetch position data
  const position = await client.getPosition(positionPubkey);
  if (!position) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  await position.refreshData();

  const positionMint = await client.getFetcher().getMintInfo(position.getData().positionMint);
  if (!positionMint) {
    throw httpErrors.notFound(`Position mint not found: ${position.getData().positionMint.toString()}`);
  }

  // Fetch whirlpool data
  const whirlpoolPubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpoolPubkey, IGNORE_CACHE);
  if (!whirlpool) {
    throw httpErrors.notFound(`Whirlpool not found: ${whirlpoolPubkey.toString()}`);
  }

  await whirlpool.refreshData();

  // Fetch token mint info
  const mintA = await client.getFetcher().getMintInfo(whirlpool.getTokenAInfo().address);
  const mintB = await client.getFetcher().getMintInfo(whirlpool.getTokenBInfo().address);
  if (!mintA || !mintB) {
    throw httpErrors.notFound('Token mint not found');
  }

  // Build transaction
  const builder = new TransactionBuilder(client.getContext().connection, client.getContext().wallet);

  // Get token owner accounts (ATAs)
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

  // Ensure ATAs exist for receiving tokens
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenAInfo().address,
    tokenOwnerAccountA,
    mintA.tokenProgram,
    'receive',
  );
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenBInfo().address,
    tokenOwnerAccountB,
    mintB.tokenProgram,
    'receive',
  );

  const hasLiquidity = !position.getData().liquidity.isZero();
  const hasFees = !position.getData().feeOwedA.isZero() || !position.getData().feeOwedB.isZero();

  let baseTokenAmountRemoved = 0;
  let quoteTokenAmountRemoved = 0;
  let baseFeeAmountCollected = 0;
  let quoteFeeAmountCollected = 0;

  // Step 1: Update fees and rewards if position has liquidity (must be done BEFORE removing liquidity)
  if (hasLiquidity) {
    const { lower, upper } = getTickArrayPubkeys(position.getData(), whirlpool.getData(), whirlpoolPubkey);
    builder.addInstruction(
      WhirlpoolIx.updateFeesAndRewardsIx(client.getContext().program, {
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
      liquidity: position.getData().liquidity,
      sqrtPrice: whirlpool.getData().sqrtPrice,
      tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
      tickLowerIndex: position.getData().tickLowerIndex,
      tickUpperIndex: position.getData().tickUpperIndex,
      tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(client.getFetcher(), whirlpool.getData()),
      slippageTolerance: Percentage.fromDecimal(new Decimal(50)),
    });

    const { lower, upper } = getTickArrayPubkeys(position.getData(), whirlpool.getData(), whirlpoolPubkey);
    builder.addInstruction(
      WhirlpoolIx.decreaseLiquidityV2Ix(client.getContext().program, {
        liquidityAmount: decreaseQuote.liquidityAmount,
        tokenMinA: decreaseQuote.tokenMinA,
        tokenMinB: decreaseQuote.tokenMinB,
        position: positionPubkey,
        positionAuthority: client.getContext().wallet.publicKey,
        tokenMintA: whirlpool.getTokenAInfo().address,
        tokenMintB: whirlpool.getTokenBInfo().address,
        positionTokenAccount: getAssociatedTokenAddressSync(
          position.getData().positionMint,
          client.getContext().wallet.publicKey,
          undefined,
          positionMint.tokenProgram,
        ),
        tickArrayLower: lower,
        tickArrayUpper: upper,
        tokenOwnerAccountA,
        tokenOwnerAccountB,
        tokenProgramA: mintA.tokenProgram,
        tokenProgramB: mintB.tokenProgram,
        tokenVaultA: whirlpool.getTokenVaultAInfo().address,
        tokenVaultB: whirlpool.getTokenVaultBInfo().address,
        whirlpool: whirlpoolPubkey,
        tokenTransferHookAccountsA: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          client.getContext().provider.connection,
          mintA,
          tokenOwnerAccountA,
          whirlpool.getTokenVaultAInfo().address,
          client.getContext().wallet.publicKey,
        ),
        tokenTransferHookAccountsB: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          client.getContext().provider.connection,
          mintB,
          tokenOwnerAccountB,
          whirlpool.getTokenVaultBInfo().address,
          client.getContext().wallet.publicKey,
        ),
      }),
    );

    baseTokenAmountRemoved = Number(decreaseQuote.tokenEstA) / Math.pow(10, mintA.decimals);
    quoteTokenAmountRemoved = Number(decreaseQuote.tokenEstB) / Math.pow(10, mintB.decimals);
  }

  // Step 3: Collect fees if there are fees owed or if we just removed liquidity
  if (hasFees || hasLiquidity) {
    const { lower, upper } = getTickArrayPubkeys(position.getData(), whirlpool.getData(), whirlpoolPubkey);
    const lowerTickArray = await client.getFetcher().getTickArray(lower);
    const upperTickArray = await client.getFetcher().getTickArray(upper);
    if (!lowerTickArray || !upperTickArray) {
      throw httpErrors.notFound('Tick array not found');
    }

    const collectQuote = collectFeesQuote({
      position: position.getData(),
      tickLower: TickArrayUtil.getTickFromArray(
        lowerTickArray,
        position.getData().tickLowerIndex,
        whirlpool.getData().tickSpacing,
      ),
      tickUpper: TickArrayUtil.getTickFromArray(
        upperTickArray,
        position.getData().tickUpperIndex,
        whirlpool.getData().tickSpacing,
      ),
      whirlpool: whirlpool.getData(),
      tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(client.getFetcher(), whirlpool.getData()),
    });

    builder.addInstruction(
      WhirlpoolIx.collectFeesV2Ix(client.getContext().program, {
        position: positionPubkey,
        positionAuthority: client.getContext().wallet.publicKey,
        tokenMintA: whirlpool.getTokenAInfo().address,
        tokenMintB: whirlpool.getTokenBInfo().address,
        positionTokenAccount: getAssociatedTokenAddressSync(
          position.getData().positionMint,
          client.getContext().wallet.publicKey,
          undefined,
          positionMint.tokenProgram,
        ),
        tokenOwnerAccountA,
        tokenOwnerAccountB,
        tokenProgramA: mintA.tokenProgram,
        tokenProgramB: mintB.tokenProgram,
        tokenVaultA: whirlpool.getTokenVaultAInfo().address,
        tokenVaultB: whirlpool.getTokenVaultBInfo().address,
        whirlpool: whirlpoolPubkey,
        tokenTransferHookAccountsA: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          client.getContext().provider.connection,
          mintA,
          tokenOwnerAccountA,
          whirlpool.getTokenVaultAInfo().address,
          client.getContext().wallet.publicKey,
        ),
        tokenTransferHookAccountsB: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
          client.getContext().provider.connection,
          mintB,
          tokenOwnerAccountB,
          whirlpool.getTokenVaultBInfo().address,
          client.getContext().wallet.publicKey,
        ),
      }),
    );

    // Note: We'll extract actual fee amounts from balance changes after transaction
  }

  // Step 4: Auto-unwrap WSOL to native SOL after receiving all tokens
  logger.info('Auto-unwrapping WSOL (if any) back to native SOL');
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

  // Step 5: Close position - choose instruction based on token program
  const isToken2022 = positionMint.tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
  const closePositionIxFn = isToken2022 ? WhirlpoolIx.closePositionWithTokenExtensionsIx : WhirlpoolIx.closePositionIx;

  builder.addInstruction(
    closePositionIxFn(client.getContext().program, {
      position: positionPubkey,
      positionAuthority: client.getContext().wallet.publicKey,
      positionTokenAccount: getAssociatedTokenAddressSync(
        position.getData().positionMint,
        client.getContext().wallet.publicKey,
        undefined,
        isToken2022 ? TOKEN_2022_PROGRAM_ID : undefined,
      ),
      positionMint: position.getData().positionMint,
      receiver: client.getContext().wallet.publicKey,
    }),
  );

  // Build, simulate, and send transaction
  const txPayload = await builder.build();
  await solana.simulateWithErrorHandling(txPayload.transaction);
  const { signature, fee } = await solana.sendAndConfirmTransaction(txPayload.transaction, [wallet]);

  // Extract actual amounts from balance changes (more accurate than quotes)
  const tokenA = await solana.getToken(whirlpool.getTokenAInfo().address.toString());
  const tokenB = await solana.getToken(whirlpool.getTokenBInfo().address.toString());
  if (!tokenA || !tokenB) {
    throw httpErrors.notFound('Tokens not found for balance extraction');
  }

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(
    signature,
    client.getContext().wallet.publicKey.toString(),
    [tokenA.address, tokenB.address],
  );

  // Total balance changes (positive values = received)
  const totalBaseChange = Math.abs(balanceChanges[0]);
  const totalQuoteChange = Math.abs(balanceChanges[1]);

  // If we removed liquidity, use the quote estimates as basis
  // Otherwise, all balance change is from fees
  if (hasLiquidity) {
    // We have estimates from decreaseQuote, but actual amounts might differ slightly
    // Use the estimates as reference, but ensure fees aren't negative
    baseFeeAmountCollected = Math.max(0, totalBaseChange - baseTokenAmountRemoved);
    quoteFeeAmountCollected = Math.max(0, totalQuoteChange - quoteTokenAmountRemoved);

    // If fees would be negative, it means the estimate was slightly high
    // Adjust the liquidity removed to match actual total
    if (totalBaseChange < baseTokenAmountRemoved) {
      baseTokenAmountRemoved = totalBaseChange;
      baseFeeAmountCollected = 0;
    }
    if (totalQuoteChange < quoteTokenAmountRemoved) {
      quoteTokenAmountRemoved = totalQuoteChange;
      quoteFeeAmountCollected = 0;
    }
  } else {
    // No liquidity removed, all balance change is fees
    baseFeeAmountCollected = totalBaseChange;
    quoteFeeAmountCollected = totalQuoteChange;
  }

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

        return await closePosition(network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

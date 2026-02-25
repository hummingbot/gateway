import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  WhirlpoolIx,
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
  // Note: Fee amounts are derived from actual TX balance changes after execution,
  // not from collectFeesQuote() which reads stale position data before
  // updateFeesAndRewards executes on-chain.
  if (hasFees || hasLiquidity) {
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

  // Extract rent refund and actual token amounts from the confirmed transaction.
  // Position accounts (mint, PDA, ATA) are closed by the TX, so their preBalance = rent refunded.
  // Tick arrays are NOT closed (shared resources), so they are not included here.
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  let positionRentRefunded = 0;

  if (txData) {
    const accountKeys = txData.transaction.message.getAccountKeys().staticAccountKeys;
    const preBalances = txData.meta?.preBalances || [];
    const postBalances = txData.meta?.postBalances || [];

    // Position accounts whose rent gets refunded on close
    const positionMintPubkey = position.getData().positionMint;
    const positionTokenAccount = getAssociatedTokenAddressSync(
      positionMintPubkey,
      client.getContext().wallet.publicKey,
      undefined,
      isToken2022 ? TOKEN_2022_PROGRAM_ID : undefined,
    );
    const rentAccounts: PublicKey[] = [positionMintPubkey, positionPubkey, positionTokenAccount];

    let totalRentLamports = 0;
    for (const pubkey of rentAccounts) {
      const idx = accountKeys.findIndex((key) => key.equals(pubkey));
      if (idx !== -1 && postBalances[idx] === 0 && preBalances[idx] > 0) {
        totalRentLamports += preBalances[idx];
        logger.info(`Rent refunded from ${pubkey.toString()}: ${preBalances[idx]} lamports`);
      }
    }
    positionRentRefunded = totalRentLamports / 1e9;

    // Derive actual token amounts from TX balance changes
    const tokenMintA = whirlpool.getTokenAInfo().address.toString();
    const tokenMintB = whirlpool.getTokenBInfo().address.toString();

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, wallet.publicKey.toBase58(), [
      tokenMintA,
      tokenMintB,
    ]);

    // Balance changes are positive (tokens entering wallet)
    let totalBaseReceived = Math.abs(balanceChanges[0]);
    let totalQuoteReceived = Math.abs(balanceChanges[1]);

    // When SOL is one of the tokens, wallet balance change includes:
    // liquidity + fees + rent refund - tx fee
    // Subtract rent refund and add back tx fee to isolate actual token amounts
    const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
    if (tokenMintA === SOL_NATIVE_MINT) {
      totalBaseReceived = totalBaseReceived - positionRentRefunded + fee;
      if (totalBaseReceived < 0) totalBaseReceived = 0;
    } else if (tokenMintB === SOL_NATIVE_MINT) {
      totalQuoteReceived = totalQuoteReceived - positionRentRefunded + fee;
      if (totalQuoteReceived < 0) totalQuoteReceived = 0;
    }

    // Separate fees from liquidity amounts:
    // totalReceived = liquidityRemoved + feesCollected
    // feesCollected = totalReceived - liquidityRemoved (from decreaseQuote estimate)
    baseFeeAmountCollected = Math.max(0, totalBaseReceived - baseTokenAmountRemoved);
    quoteFeeAmountCollected = Math.max(0, totalQuoteReceived - quoteTokenAmountRemoved);

    // Update removed amounts to actuals (totalReceived - fees)
    baseTokenAmountRemoved = totalBaseReceived - baseFeeAmountCollected;
    quoteTokenAmountRemoved = totalQuoteReceived - quoteFeeAmountCollected;
  }

  logger.info(
    `Position closed: removed=${baseTokenAmountRemoved.toFixed(6)} tokenA + ${quoteTokenAmountRemoved.toFixed(6)} tokenB, ` +
      `fees=${baseFeeAmountCollected.toFixed(6)} tokenA + ${quoteFeeAmountCollected.toFixed(6)} tokenB, ` +
      `rent refunded=${positionRentRefunded.toFixed(6)} SOL`,
  );

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

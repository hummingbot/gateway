import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  WhirlpoolIx,
  decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil,
  IGNORE_CACHE,
} from '@orca-so/whirlpools-sdk';
import { Static } from '@sinclair/typebox';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmRemoveLiquidityRequest } from '../schemas';

export async function removeLiquidity(
  network: string,
  address: string,
  positionAddress: string,
  liquidityPct: number,
  slippagePct: number,
): Promise<RemoveLiquidityResponseType> {
  if (liquidityPct <= 0 || liquidityPct > 100) {
    throw httpErrors.badRequest('liquidityPct must be between 0 and 100');
  }

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

  // Calculate liquidity amount to remove
  const liquidityAmount = new BN(
    new Decimal(position.getData().liquidity.toString()).mul(liquidityPct).div(100).floor().toString(),
  );

  if (liquidityAmount.isZero() || liquidityAmount.gt(position.getData().liquidity)) {
    throw httpErrors.badRequest('Invalid liquidity amount calculated');
  }

  // Get decrease liquidity quote
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    liquidity: liquidityAmount,
    sqrtPrice: whirlpool.getData().sqrtPrice,
    tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(client.getFetcher(), whirlpool.getData()),
    slippageTolerance: Percentage.fromDecimal(new Decimal(slippagePct)),
  });

  logger.info(
    `Removing ${liquidityPct}% liquidity, estimated: ${(Number(quote.tokenEstA) / Math.pow(10, mintA.decimals)).toFixed(6)} tokenA, ${(Number(quote.tokenEstB) / Math.pow(10, mintB.decimals)).toFixed(6)} tokenB`,
  );

  // Build transaction
  const builder = new TransactionBuilder(client.getContext().connection, client.getContext().wallet);

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

  // Handle WSOL ATAs for receiving withdrawn liquidity
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

  const { lower, upper } = getTickArrayPubkeys(position.getData(), whirlpool.getData(), whirlpoolPubkey);
  builder.addInstruction(
    WhirlpoolIx.decreaseLiquidityV2Ix(client.getContext().program, {
      liquidityAmount: quote.liquidityAmount,
      tokenMinA: quote.tokenMinA,
      tokenMinB: quote.tokenMinB,
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

  // Auto-unwrap WSOL liquidity to native SOL (must be AFTER decreaseLiquidity)
  logger.info('Auto-unwrapping WSOL liquidity (if any) back to native SOL');
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

  // Build, simulate, and send transaction
  const txPayload = await builder.build();
  await solana.simulateWithErrorHandling(txPayload.transaction);
  const { signature, fee } = await solana.sendAndConfirmTransaction(txPayload.transaction, [wallet]);

  // Extract removed amounts from balance changes
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

        return await removeLiquidity(network, walletAddress, positionAddress, liquidityPct, slippagePct);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

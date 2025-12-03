import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  WhirlpoolIx,
  increaseLiquidityQuoteByInputTokenWithParams,
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
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmAddLiquidityRequest } from '../schemas';

export async function addLiquidity(
  network: string,
  address: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number,
): Promise<AddLiquidityResponseType> {
  // Validate at least one amount is provided
  if ((!baseTokenAmount || baseTokenAmount <= 0) && (!quoteTokenAmount || quoteTokenAmount <= 0)) {
    throw httpErrors.badRequest('At least one token amount must be provided and greater than 0');
  }

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);
  const client = await orca.getWhirlpoolClientForWallet(address);
  const positionPubkey = new PublicKey(positionAddress);

  // Fetch position data
  const position = await client.getPosition(positionPubkey, IGNORE_CACHE);

  await position.refreshData();

  const positionData = position.getData();

  if (!positionData) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const positionMint = await client.getFetcher().getMintInfo(positionData.positionMint);
  if (!positionMint) {
    throw httpErrors.notFound(`Position mint not found: ${positionData.positionMint.toString()}`);
  }

  // Fetch whirlpool data
  const whirlpoolPubkey = positionData.whirlpool;
  const whirlpool = await client.getPool(whirlpoolPubkey, IGNORE_CACHE);
  if (!whirlpool) {
    throw httpErrors.notFound(`Whirlpool not found: ${whirlpoolPubkey.toString()}`);
  }

  // Fetch token mint info
  const mintA = whirlpool.getTokenAInfo();
  const mintB = whirlpool.getTokenBInfo();
  if (!mintA || !mintB) {
    throw httpErrors.notFound('Token mint not found');
  }

  // Get token extension context once
  const tokenExtensionCtx = await TokenExtensionUtil.buildTokenExtensionContext(
    client.getFetcher(),
    whirlpool.getData(),
  );
  const slippageTolerance = Percentage.fromDecimal(new Decimal(slippagePct));

  // Determine which token to use as input based on which amounts won't exceed user limits
  let quote: any;

  // If both amounts provided, get quotes for both scenarios and pick the valid one
  if (baseTokenAmount > 0 && quoteTokenAmount > 0) {
    // Try quote using baseToken as input
    const baseAmount = new BN(Math.floor(baseTokenAmount * Math.pow(10, mintA.decimals)));
    const quoteFromBase = increaseLiquidityQuoteByInputTokenWithParams({
      inputTokenAmount: baseAmount,
      inputTokenMint: whirlpool.getTokenAInfo().address,
      sqrtPrice: whirlpool.getData().sqrtPrice,
      tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
      tickLowerIndex: positionData.tickLowerIndex,
      tickUpperIndex: positionData.tickUpperIndex,
      tokenExtensionCtx,
      tokenMintA: whirlpool.getTokenAInfo().address,
      tokenMintB: whirlpool.getTokenBInfo().address,
      slippageTolerance,
    });

    // Try quote using quoteToken as input
    const quoteAmount = new BN(Math.floor(quoteTokenAmount * Math.pow(10, mintB.decimals)));
    const quoteFromQuote = increaseLiquidityQuoteByInputTokenWithParams({
      inputTokenAmount: quoteAmount,
      inputTokenMint: whirlpool.getTokenBInfo().address,
      sqrtPrice: whirlpool.getData().sqrtPrice,
      tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
      tickLowerIndex: positionData.tickLowerIndex,
      tickUpperIndex: positionData.tickUpperIndex,
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

    logger.info(`Using ${baseLimited ? 'base' : 'quote'} token as input (less liquidity = respects both limits)`);
  } else {
    // Only one amount provided, use that one
    const useBaseToken = baseTokenAmount > 0;
    const inputTokenAmount = useBaseToken ? baseTokenAmount : quoteTokenAmount;
    const inputTokenMint = useBaseToken ? whirlpool.getTokenAInfo().address : whirlpool.getTokenBInfo().address;
    const inputTokenDecimals = useBaseToken ? mintA.decimals : mintB.decimals;
    const amount = new BN(Math.floor(inputTokenAmount * Math.pow(10, inputTokenDecimals)));

    quote = increaseLiquidityQuoteByInputTokenWithParams({
      inputTokenAmount: amount,
      inputTokenMint,
      sqrtPrice: whirlpool.getData().sqrtPrice,
      tickCurrentIndex: whirlpool.getData().tickCurrentIndex,
      tickLowerIndex: positionData.tickLowerIndex,
      tickUpperIndex: positionData.tickUpperIndex,
      tokenExtensionCtx,
      tokenMintA: whirlpool.getTokenAInfo().address,
      tokenMintB: whirlpool.getTokenBInfo().address,
      slippageTolerance,
    });
  }

  logger.info(
    `Adding liquidity: ${(Number(quote.tokenEstA) / Math.pow(10, mintA.decimals)).toFixed(6)} tokenA, ${(Number(quote.tokenEstB) / Math.pow(10, mintB.decimals)).toFixed(6)} tokenB`,
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

  // Handle WSOL wrapping for tokens (or create regular ATAs)
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenAInfo().address,
    tokenOwnerAccountA,
    mintA.tokenProgram,
    'wrap',
    quote.tokenMaxA,
    solana,
  );
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenBInfo().address,
    tokenOwnerAccountB,
    mintB.tokenProgram,
    'wrap',
    quote.tokenMaxB,
    solana,
  );

  const { lower, upper } = getTickArrayPubkeys(positionData, whirlpool.getData(), whirlpoolPubkey);
  builder.addInstruction(
    WhirlpoolIx.increaseLiquidityV2Ix(client.getContext().program, {
      liquidityAmount: quote.liquidityAmount,
      tokenMaxA: quote.tokenMaxA,
      tokenMaxB: quote.tokenMaxB,
      position: positionPubkey,
      positionAuthority: client.getContext().wallet.publicKey,
      tokenMintA: whirlpool.getTokenAInfo().address,
      tokenMintB: whirlpool.getTokenBInfo().address,
      positionTokenAccount: getAssociatedTokenAddressSync(
        positionData.positionMint,
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

  // Auto-unwrap any leftover WSOL (from slippage savings)
  logger.info('Auto-unwrapping leftover WSOL (if any) back to native SOL');
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

  // Extract added amounts from balance changes
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
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;

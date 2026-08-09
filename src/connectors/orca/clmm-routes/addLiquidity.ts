import { increaseLiquidityInstructions } from '@orca-so/whirlpools';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import {
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  type IncreaseLiquidityQuote,
} from '@orca-so/whirlpools-core';
import { Static } from '@sinclair/typebox';
import { address } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getCurrentTransferFee } from '../orca.position';
import { buildOrcaTransaction, createOrcaAuthority } from '../orca.sdk';
import { OrcaClmmAddLiquidityRequest } from '../schemas';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number,
): Promise<AddLiquidityResponseType> {
  if ((!baseTokenAmount || baseTokenAmount <= 0) && (!quoteTokenAmount || quoteTokenAmount <= 0)) {
    throw httpErrors.badRequest('At least one token amount must be provided and greater than 0');
  }

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const walletPublicKey = new PublicKey(walletAddress);
  const position = await fetchPosition(orca.solanaKitRpc, address(positionAddress));
  const whirlpool = await fetchWhirlpool(orca.solanaKitRpc, position.data.whirlpool);
  const [mintA, mintB] = await fetchAllMint(orca.solanaKitRpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  const currentEpoch = await orca.solanaKitRpc.getEpochInfo().send();
  const transferFeeA = getCurrentTransferFee(mintA, currentEpoch.epoch);
  const transferFeeB = getCurrentTransferFee(mintB, currentEpoch.epoch);
  const slippageBps = Math.round(slippagePct * 100);

  const baseAmount = BigInt(Math.floor(baseTokenAmount * 10 ** mintA.data.decimals));
  const quoteAmount = BigInt(Math.floor(quoteTokenAmount * 10 ** mintB.data.decimals));
  let quote: IncreaseLiquidityQuote;

  if (baseAmount > 0n && quoteAmount > 0n) {
    const quoteFromBase = increaseLiquidityQuoteA(
      baseAmount,
      slippageBps,
      whirlpool.data.sqrtPrice,
      position.data.tickLowerIndex,
      position.data.tickUpperIndex,
      transferFeeA,
      transferFeeB,
    );
    const quoteFromQuote = increaseLiquidityQuoteB(
      quoteAmount,
      slippageBps,
      whirlpool.data.sqrtPrice,
      position.data.tickLowerIndex,
      position.data.tickUpperIndex,
      transferFeeA,
      transferFeeB,
    );
    quote = quoteFromBase.liquidityDelta < quoteFromQuote.liquidityDelta ? quoteFromBase : quoteFromQuote;
  } else if (baseAmount > 0n) {
    quote = increaseLiquidityQuoteA(
      baseAmount,
      slippageBps,
      whirlpool.data.sqrtPrice,
      position.data.tickLowerIndex,
      position.data.tickUpperIndex,
      transferFeeA,
      transferFeeB,
    );
  } else {
    quote = increaseLiquidityQuoteB(
      quoteAmount,
      slippageBps,
      whirlpool.data.sqrtPrice,
      position.data.tickLowerIndex,
      position.data.tickUpperIndex,
      transferFeeA,
      transferFeeB,
    );
  }

  if (quote.liquidityDelta <= 0n) {
    throw httpErrors.badRequest('Token amount is too small to add liquidity');
  }
  logger.info(
    `Adding liquidity: ${(Number(quote.tokenEstA) / 10 ** mintA.data.decimals).toFixed(6)} tokenA, ` +
      `${(Number(quote.tokenEstB) / 10 ** mintB.data.decimals).toFixed(6)} tokenB`,
  );

  const result = await increaseLiquidityInstructions(
    orca.solanaKitRpc,
    position.data.positionMint,
    { tokenMaxA: quote.tokenMaxA, tokenMaxB: quote.tokenMaxB },
    {
      authority: createOrcaAuthority(walletAddress),
      slippageToleranceBps: slippageBps,
      whirlpoolDeployment: orca.deployment,
    },
  );
  const transaction = buildOrcaTransaction(result.instructions, walletAddress);
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);

  const tokenAAddress = whirlpool.data.tokenMintA.toString();
  const tokenBAddress = whirlpool.data.tokenMintB.toString();
  const [tokenA, tokenB, balanceResult] = await Promise.all([
    solana.getToken(tokenAAddress),
    solana.getToken(tokenBAddress),
    solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [tokenAAddress, tokenBAddress]),
  ]);
  const { balanceChanges } = balanceResult;

  logger.info(
    `Liquidity added: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA?.symbol || 'tokenA'}, ` +
      `${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB?.symbol || 'tokenB'}`,
  );

  return {
    signature,
    status: 1,
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
        response: { 200: AddLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const {
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct = 1,
          network,
        } = request.body;
        return await addLiquidity(
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount || 0,
          quoteTokenAmount || 0,
          slippagePct,
        );
      } catch (error) {
        logger.error(error);
        if (error.statusCode) throw error;
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;

import { increaseLiquidityInstructions } from '@orca-so/whirlpools';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import {
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  type IncreaseLiquidityQuote,
} from '@orca-so/whirlpools-core';
import { address } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaConfig } from '../orca.config';
import { getCurrentTransferFee } from '../orca.position';
import { buildOrcaTransaction, createOrcaAuthority } from '../orca.sdk';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = OrcaConfig.config.slippagePct ?? 1,
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
    // The estimates, not the quote's ceilings — the same correction as openPosition.
    // increaseLiquidityQuote* already applied slippageBps to produce tokenMax*, and this
    // builder applies slippageToleranceBps again to derive the on-chain maximums, so
    // passing tokenMax* deposits slippagePct more than was asked for. The log line above
    // has always reported tokenEst*, which is what the transaction should be spending.
    { tokenMaxA: quote.tokenEstA, tokenMaxB: quote.tokenEstB },
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
      // The pool this position belongs to, already loaded here. The unified route is
      // position-addressed and never receives it, so this is the only place it can
      // come from without a second lookup.
      poolAddress: position.data.whirlpool.toString(),
      fee,
      baseTokenAmountAdded: Math.abs(balanceChanges[0]),
      quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
    },
  };
}

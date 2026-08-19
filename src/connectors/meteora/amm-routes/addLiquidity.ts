import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';

import { openPosition } from './openPosition';
import { getLiquidityQuote } from './quoteLiquidity';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
  positionAddress?: string,
): Promise<AddLiquidityResponseType> {
  // Opening a new position is its own on-chain operation (it mints the position NFT
  // and locks rent), so it lives in openPosition and is reachable directly through
  // /trading/amm/open. Adding without a position address still opens one — we never
  // silently pick an existing position — and reports the add-shaped subset of it.
  if (!positionAddress) {
    const opened = await openPosition(
      network,
      walletAddress,
      poolAddress,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct,
    );
    return opened.data
      ? {
          signature: opened.signature,
          status: opened.status,
          data: {
            fee: opened.data.fee,
            baseTokenAmountAdded: opened.data.baseTokenAmountAdded,
            quoteTokenAmountAdded: opened.data.quoteTokenAmountAdded,
          },
        }
      : { signature: opened.signature, status: opened.status };
  }

  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const { tokenAProgram, tokenBProgram } = meteoraDamm.getTokenPrograms(poolState);

  const quote = await getLiquidityQuote(meteoraDamm, poolState, baseTokenAmount, quoteTokenAmount, slippagePct);
  if (quote.liquidityDelta.isZero()) {
    throw httpErrors.badRequest('Computed liquidity is zero — increase the token amounts');
  }

  const existing = await meteoraDamm.getUserPositions(poolAddress, walletAddress);
  const target = existing.find((p) => p.position.toBase58() === positionAddress);
  if (!target) {
    throw httpErrors.notFound(
      `Position ${positionAddress} not found for wallet in pool ${poolAddress}. ` +
        'List the wallet positions with position-info, or omit positionAddress to open a new position.',
    );
  }

  logger.info(`Adding liquidity to existing DAMM v2 position ${target.position.toBase58()} in pool ${poolAddress}`);
  const transaction = await meteoraDamm.cpAmm.addLiquidity({
    owner: new PublicKey(walletAddress),
    pool: new PublicKey(poolAddress),
    position: target.position,
    positionNftAccount: target.positionNftAccount,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    liquidityDelta: quote.liquidityDelta,
    maxAmountTokenA: quote.maxAmountTokenA,
    maxAmountTokenB: quote.maxAmountTokenB,
    tokenAAmountThreshold: quote.maxAmountTokenA,
    tokenBAmountThreshold: quote.maxAmountTokenB,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAProgram,
    tokenBProgram,
  });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      poolState.tokenAMint.toBase58(),
      poolState.tokenBMint.toBase58(),
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: Math.abs(balanceChanges[0]),
        quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0 }; // PENDING
}

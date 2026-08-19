import { derivePositionAddress } from '@meteora-ag/cp-amm-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';

import { getLiquidityQuote } from './quoteLiquidity';

/**
 * Open a NEW DAMM v2 position and seed it with liquidity.
 *
 * DAMM v2 positions are NFTs, so opening one is a distinct on-chain operation
 * (`createPositionAndAddLiquidity`) rather than a variant of adding: it mints the
 * position NFT and locks rent for the account. Adding to a position that already
 * exists goes through addLiquidity with its address.
 */
export async function openPosition(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const { tokenAProgram, tokenBProgram } = meteoraDamm.getTokenPrograms(poolState);

  const quote = await getLiquidityQuote(meteoraDamm, poolState, baseTokenAmount, quoteTokenAmount, slippagePct);
  if (quote.liquidityDelta.isZero()) {
    throw httpErrors.badRequest('Computed liquidity is zero — increase the token amounts');
  }

  const positionNft = Keypair.generate();
  logger.info(`Opening new DAMM v2 position (NFT ${positionNft.publicKey.toBase58()}) in pool ${poolAddress}`);

  const transaction = await meteoraDamm.cpAmm.createPositionAndAddLiquidity({
    owner: new PublicKey(walletAddress),
    pool: new PublicKey(poolAddress),
    positionNft: positionNft.publicKey,
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

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [positionNft]);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (!txData) {
    // Submitted but not yet confirmed. The position address is only knowable from
    // the landed transaction, so it is reported once the poller sees it confirm.
    return { signature, status: 0 };
  }

  // The position account is derived from the NFT mint; its post-balance is the rent
  // the account now holds, which comes back to the wallet when the position closes.
  const position = derivePositionAddress(positionNft.publicKey);
  const accountKeys = txData.transaction.message.getAccountKeys().staticAccountKeys;
  const positionIndex = accountKeys.findIndex((key) => key.equals(position));
  const positionRent = positionIndex === -1 ? 0 : (txData.meta?.postBalances?.[positionIndex] ?? 0) / 1e9;

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
    poolState.tokenAMint.toBase58(),
    poolState.tokenBMint.toBase58(),
  ]);

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee: txData.meta.fee / 1e9,
      positionAddress: position.toBase58(),
      positionRent,
      baseTokenAmountAdded: Math.abs(balanceChanges[0]),
      quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
    },
  };
}

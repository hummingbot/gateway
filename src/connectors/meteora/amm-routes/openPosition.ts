import { derivePositionAddress } from '@meteora-ag/cp-amm-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { accountLifecycleSol, liquidityWithoutRent } from '../../../chains/solana/solana.utils';
import { AddLiquidityResponseType } from '../../../schemas/amm-schema';
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
): Promise<AddLiquidityResponseType> {
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

  // Opening locks rent in three accounts — the position, the NFT mint that represents
  // it, and that mint's token account — and the wallet pays for all of them. Reading the
  // position's own balance alone left the other two inside the reported deposit.
  const position = derivePositionAddress(positionNft.publicKey);
  const { opened, rentLocked } = accountLifecycleSol(txData);

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
    poolState.tokenAMint.toBase58(),
    poolState.tokenBMint.toBase58(),
  ]);

  // The native side of the change carries every lamport those accounts locked; take all
  // of it out to leave the liquidity actually deposited. The transaction fee needs no
  // correction — extractBalanceChangesAndFee already adds it back for the fee payer and
  // reports it separately as `fee`.
  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee: txData.meta.fee / 1e9,
      positionAddress: position.toBase58(),
      positionRent: rentLocked,
      baseTokenAmountAdded: liquidityWithoutRent(balanceChanges[0], poolState.tokenAMint, opened),
      quoteTokenAmountAdded: liquidityWithoutRent(balanceChanges[1], poolState.tokenBMint, opened),
    },
  };
}

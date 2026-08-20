import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { accountLamports } from '../../../chains/solana/solana.utils';
import { RemoveLiquidityResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';

function withSlippageDown(raw: BN, slippagePct: number): BN {
  return new BN(new Decimal(raw.toString()).mul(1 - slippagePct / 100).toFixed(0));
}

/**
 * Withdraw all of a DAMM v2 position's liquidity and close the position account
 * itself, which returns the account's rent to the wallet.
 *
 * Not a route of its own. It is what removeLiquidity does at 100%, because removing
 * all the liquidity without this leaves an empty position NFT behind still holding
 * its rent, and nothing later reclaims it. The SDK's
 * removeAllLiquidityAndClosePosition does both in one transaction.
 */
export async function closePosition(
  network: string,
  walletAddress: string,
  poolAddress: string,
  positionAddress: string,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const poolState = await meteoraDamm.getPoolState(poolAddress);

  // getUserPositions is owner-filtered, so finding the position here also proves the
  // wallet owns it and that it belongs to this pool.
  const positions = await meteoraDamm.getUserPositions(poolAddress, walletAddress);
  const target = positions.find((p) => p.position.toBase58() === positionAddress);
  if (!target) {
    throw httpErrors.notFound(
      `Position ${positionAddress} not found for wallet in pool ${poolAddress}. ` +
        'List the wallet positions with position-info.',
    );
  }

  const unlocked = target.positionState.unlockedLiquidity;
  // A position whose liquidity is still vesting cannot be closed: the program keeps
  // the account alive until the lock expires, so report that instead of failing on-chain.
  if (target.positionState.vestedLiquidity && !target.positionState.vestedLiquidity.isZero()) {
    throw httpErrors.badRequest(
      `Position ${positionAddress} still holds vested (locked) liquidity and cannot be closed yet. ` +
        'Remove the unlocked portion with remove, and close once the vesting completes.',
    );
  }

  const withdrawQuote = meteoraDamm.cpAmm.getWithdrawQuote({
    liquidityDelta: unlocked,
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
    sqrtPrice: poolState.sqrtPrice,
    collectFeeMode: poolState.collectFeeMode,
    tokenAAmount: poolState.tokenAAmount,
    tokenBAmount: poolState.tokenBAmount,
    liquidity: poolState.liquidity,
  });

  const vestings = (await meteoraDamm.cpAmm.getAllVestingsByPosition(target.position)).map((v) => ({
    account: v.publicKey,
    vestingState: v.account,
  }));

  const slot = await solana.connection.getSlot();
  const time = await solana.connection.getBlockTime(slot);
  const currentPoint = meteoraDamm.getCurrentPoint(poolState, slot, time ?? Math.floor(Date.now() / 1000));

  logger.info(`Closing DAMM v2 position ${target.position.toBase58()} in pool ${poolAddress}`);

  const transaction = await meteoraDamm.cpAmm.removeAllLiquidityAndClosePosition({
    owner: new PublicKey(walletAddress),
    position: target.position,
    positionNftAccount: target.positionNftAccount,
    poolState,
    positionState: target.positionState,
    tokenAAmountThreshold: withSlippageDown(withdrawQuote.outAmountA, slippagePct),
    tokenBAmountThreshold: withSlippageDown(withdrawQuote.outAmountB, slippagePct),
    vestings,
    currentPoint,
  });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (!txData) {
    return { signature, status: 0 }; // PENDING
  }

  // The position account's balance BEFORE the close is exactly the rent that comes back.
  const positionRentRefunded = accountLamports(txData, target.position, 'pre') ?? 0;

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
    poolState.tokenAMint.toBase58(),
    poolState.tokenBMint.toBase58(),
  ]);

  const fee = txData.meta.fee / 1e9;
  const nativeMint = 'So11111111111111111111111111111111111111112';
  // When a pool side IS the native token, the wallet's balance change for it also
  // carries the rent refund, so back that out to leave the liquidity actually
  // withdrawn. The transaction fee needs no correction here: extractBalanceChangesAndFee
  // already adds it back for the fee payer and reports it separately as `fee`, so
  // subtracting it again would understate the amount by one fee.
  const adjust = (change: number, mint: PublicKey) =>
    mint.toBase58() === nativeMint ? Math.max(0, Math.abs(change) - positionRentRefunded) : Math.abs(change);

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      positionRentRefunded,
      baseTokenAmountRemoved: adjust(balanceChanges[0], poolState.tokenAMint),
      quoteTokenAmountRemoved: adjust(balanceChanges[1], poolState.tokenBMint),
    },
  };
}

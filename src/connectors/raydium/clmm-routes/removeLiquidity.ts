import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { accountLifecycleSol, liquidityWithoutRent } from '../../../chains/solana/solana.utils';
import { RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  closePosition: boolean = false,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Set the SDK owner to the wallet's public key — works for every wallet type (local,
  // hardware). The tx is built unsigned; signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which signs for the wallet's type.
  await raydium.setOwner(new PublicKey(walletAddress));

  const positionInfo = await raydium.getClmmPosition(positionAddress);
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(positionInfo.poolId.toBase58());

  if (positionInfo.liquidity.isZero()) {
    throw new Error('Position has zero liquidity - nothing to remove');
  }
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw new Error('Invalid percentageToRemove - must be between 0 and 100');
  }

  const liquidityToRemove = new BN(
    new Decimal(positionInfo.liquidity.toString()).mul(percentageToRemove / 100).toFixed(0),
  );

  logger.info(`Removing ${percentageToRemove.toFixed(4)}% liquidity from position ${positionAddress}`);

  // Use hardcoded compute units for remove liquidity
  const COMPUTE_UNITS = 600000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  const { transaction } = await raydium.raydiumSDK.clmm.decreaseLiquidity({
    poolInfo,
    poolKeys,
    ownerPosition: positionInfo,
    ownerInfo: {
      useSOLBalance: true,
      closePosition: closePosition,
    },
    liquidity: liquidityToRemove,
    amountMinA: new BN(0),
    amountMinB: new BN(0),
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: COMPUTE_UNITS,
      microLamports: priorityFeePerCU,
    },
  });

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
  // simulates internally).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);
  const confirmed = txData !== null;

  // Return with status
  if (confirmed && txData) {
    // Transaction confirmed, return full data
    const tokenAInfo = await solana.getToken(poolInfo.mintA.address);
    const tokenBInfo = await solana.getToken(poolInfo.mintB.address);

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      tokenAInfo?.address || poolInfo.mintA.address,
      tokenBInfo?.address || poolInfo.mintB.address,
    ]);

    // A 100% removal closes the position and its NFT account in the same transaction, so
    // their rent comes back inside the native side of this change. It is not liquidity.
    // A partial removal closes nothing and this is a no-op.
    const { closed } = accountLifecycleSol(txData);
    const baseTokenBalanceChange = liquidityWithoutRent(
      balanceChanges[0],
      new PublicKey(tokenAInfo?.address || poolInfo.mintA.address),
      closed,
    );
    const quoteTokenBalanceChange = liquidityWithoutRent(
      balanceChanges[1],
      new PublicKey(tokenBInfo?.address || poolInfo.mintB.address),
      closed,
    );

    logger.info(
      `Liquidity removed from position ${positionAddress}: ${baseTokenBalanceChange.toFixed(4)} ${poolInfo.mintA.symbol}, ${quoteTokenBalanceChange.toFixed(4)} ${poolInfo.mintB.symbol}`,
    );

    const totalFee = txData.meta.fee;
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        // The pool this position belongs to, already loaded here. The unified route is
        // position-addressed and never receives it, so this is the only place it can
        // come from without a second lookup.
        poolAddress: positionInfo.poolId.toBase58(),
        fee: totalFee / 1e9,
        baseTokenAmountRemoved: baseTokenBalanceChange,
        quoteTokenAmountRemoved: quoteTokenBalanceChange,
      },
    };
  } else {
    // Transaction pending, return for Hummingbot to handle retry
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

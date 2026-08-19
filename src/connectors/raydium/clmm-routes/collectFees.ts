import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

/**
 * Collect accumulated fees from a position WITHOUT touching its liquidity.
 *
 * The Raydium CLMM program has no owner-facing "collect fees" instruction — fees owed
 * to a position are transferred by decrease_liquidity. Calling it with liquidity = 0
 * collects what is owed and leaves the position intact. This route used to remove 1%
 * of the position and report the withdrawn principal as fees, which both mutated the
 * position and mis-stated the amounts.
 */
export async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Set the SDK owner to the wallet's public key — works for every wallet type (local,
  // hardware). The tx is built unsigned; signing/sending is delegated below.
  await raydium.setOwner(new PublicKey(walletAddress));

  const position = await raydium.getClmmPosition(positionAddress);
  if (!position) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());

  const tokenA = await solana.getToken(poolInfo.mintA.address);
  const tokenB = await solana.getToken(poolInfo.mintB.address);

  logger.info(`Collecting fees from CLMM position ${positionAddress} via zero-liquidity decrease`);

  const COMPUTE_UNITS = 600000;
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  const { transaction } = await raydium.raydiumSDK.clmm.decreaseLiquidity({
    poolInfo,
    poolKeys,
    ownerPosition: position,
    ownerInfo: {
      useSOLBalance: true,
      closePosition: false,
    },
    liquidity: new BN(0), // collect fees only; principal untouched
    amountMinA: new BN(0),
    amountMinB: new BN(0),
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: COMPUTE_UNITS,
      microLamports: priorityFeePerCU,
    },
  });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    // No liquidity moved, so the whole balance change is fees.
    const { baseTokenChange, quoteTokenChange } = await solana.extractClmmBalanceChanges(
      signature,
      walletAddress,
      tokenA,
      tokenB,
    );

    logger.info(
      `Fees collected from position ${positionAddress}: ${Math.abs(baseTokenChange).toFixed(4)} ${tokenA.symbol}, ${Math.abs(quoteTokenChange).toFixed(4)} ${tokenB.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseFeeAmountCollected: Math.abs(baseTokenChange),
        quoteFeeAmountCollected: Math.abs(quoteTokenChange),
      },
    };
  }

  return {
    signature,
    status: 0, // PENDING
  };
}

import { AccountLayout } from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pump } from '../pump';
import { PumpConfig } from '../pump.config';

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number,
  slippagePct: number = PumpConfig.config.slippagePct,
): Promise<RemoveLiquidityResponseType> {
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('Invalid percentageToRemove - must be between 0 and 100');
  }

  const solana = await Solana.getInstance(network);
  const pump = await Pump.getInstance(network);
  const walletPk = new PublicKey(walletAddress);

  const state = await pump.getLiquidityState(poolAddress, walletPk);

  if (!state.userPoolAccountInfo) {
    throw httpErrors.badRequest(`No LP token account found for pool ${poolAddress} - nothing to remove`);
  }
  const lpBalance = new BN(AccountLayout.decode(new Uint8Array(state.userPoolAccountInfo.data)).amount.toString());
  if (lpBalance.isZero()) {
    throw httpErrors.badRequest('LP token balance is zero - nothing to remove');
  }

  const lpToRemove = new BN(new Decimal(lpBalance.toString()).mul(percentageToRemove).div(100).toFixed(0));

  logger.info(`Removing ${percentageToRemove.toFixed(4)}% liquidity from PumpSwap pool ${poolAddress}...`);

  const instructions = await pump.ammSdk.withdrawInstructions(state, lpToRemove, slippagePct);
  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = walletPk;

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware/build
  // mode, simulates, and sets blockhash + compute budget internally).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      state.pool.baseMint.toBase58(),
      state.pool.quoteMint.toBase58(),
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountRemoved: Math.abs(balanceChanges[0]),
        quoteTokenAmountRemoved: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0 /* PENDING */ };
}

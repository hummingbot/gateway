import { PublicKey, Transaction } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { accountLifecycleSol, liquidityWithoutRent } from '../../../chains/solana/solana.utils';
import { AddLiquidityResponseType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pump } from '../pump';
import { PumpConfig } from '../pump.config';

import { getLiquidityQuote } from './quoteLiquidity';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = PumpConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const pump = await Pump.getInstance(network);
  const walletPk = new PublicKey(walletAddress);

  const state = await pump.getLiquidityState(poolAddress, walletPk);
  const liquidityQuote = await getLiquidityQuote(pump, state, baseTokenAmount, quoteTokenAmount, slippagePct);

  logger.info(
    `Adding liquidity to PumpSwap pool ${poolAddress}: ` +
      `${liquidityQuote.quote.baseTokenAmount} base + ${liquidityQuote.quote.quoteTokenAmount} quote ` +
      `(${liquidityQuote.baseLimited ? 'base' : 'quote'}-limited)`,
  );

  const instructions = await pump.ammSdk.depositInstructionsInternal(
    state,
    liquidityQuote.lpToken,
    liquidityQuote.maxBase,
    liquidityQuote.maxQuote,
  );

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
    // A SOL side's balance change also carries the rent of the accounts this transaction
    // opened (the pool's own, or the wallet's LP account), which is not a deposit. The
    // rent share only: a pool vault opens holding the deposit itself.
    const { rentLocked } = accountLifecycleSol(txData);
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: liquidityWithoutRent(balanceChanges[0], state.pool.baseMint, rentLocked),
        quoteTokenAmountAdded: liquidityWithoutRent(balanceChanges[1], state.pool.quoteMint, rentLocked),
      },
    };
  }
  return { signature, status: 0 /* PENDING */ };
}

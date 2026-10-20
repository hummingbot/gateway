import { CANONICAL_POOL_INDEX, poolPda } from '@pump-fun/pump-swap-sdk';
import { PublicKey, Transaction } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pump } from '../pump';
import { toRawAmount } from '../pump.utils';

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount?: number,
  initialPrice?: number,
): Promise<CreatePoolResponseType> {
  const solana = await Solana.getInstance(network);
  const pump = await Pump.getInstance(network);
  const walletPk = new PublicKey(walletAddress);

  const baseTokenInfo = await pump.getTokenInfo(baseToken);
  const quoteTokenInfo = await pump.getTokenInfo(quoteToken);

  const quoteAmount = quoteTokenAmount ?? (initialPrice !== undefined ? baseTokenAmount * initialPrice : undefined);
  if (quoteAmount === undefined || !(quoteAmount > 0) || !(baseTokenAmount > 0)) {
    throw httpErrors.badRequest('Provide baseTokenAmount and either quoteTokenAmount or initialPrice to seed the pool');
  }

  const baseMint = new PublicKey(baseTokenInfo.address);
  const quoteMint = new PublicKey(quoteTokenInfo.address);
  const baseRaw = toRawAmount(baseTokenAmount, baseTokenInfo.decimals);
  const quoteRaw = toRawAmount(quoteAmount, quoteTokenInfo.decimals);

  const state = await pump.onlineAmm.createPoolSolanaState(CANONICAL_POOL_INDEX, walletPk, baseMint, quoteMint);
  const poolAddress = poolPda(CANONICAL_POOL_INDEX, walletPk, baseMint, quoteMint).toBase58();

  logger.info(
    `Creating PumpSwap pool ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} at ${poolAddress}: ` +
      `${baseTokenAmount} base + ${quoteAmount} quote`,
  );

  const instructions = await pump.ammSdk.createPoolInstructions(state, baseRaw, quoteRaw);
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
      baseTokenInfo.address,
      quoteTokenInfo.address,
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      poolAddress,
      price: quoteAmount / baseTokenAmount,
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: Math.abs(balanceChanges[0]),
        quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0 /* PENDING */, poolAddress, price: quoteAmount / baseTokenAmount };
}

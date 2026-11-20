import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { accountLifecycleSol, receivedWithoutAccounts } from '../../../chains/solana/solana.utils';
import { CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { buildRemoveLiquidityTransaction } from '../pancakeswap-sol.transactions';

/**
 * Collect accumulated fees from a position WITHOUT touching its liquidity.
 *
 * The PancakeSwap Solana CLMM program (a Raydium CLMM fork) has no owner-facing
 * "collect fees" instruction — like Raydium, fees (and rewards) owed to a position are
 * transferred by `decrease_liquidity_v2`. Calling it with `liquidity = 0` collects the
 * owed fees while leaving the position's liquidity intact.
 */
async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);
  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound('Token information not found');
  }

  logger.info(`Collecting fees from position ${positionAddress} via zero-liquidity decrease`);

  const walletPubkey = new PublicKey(walletAddress);
  const positionNftMint = new PublicKey(positionAddress);

  // decrease_liquidity_v2 with liquidity = 0 transfers the owed fees (and rewards)
  // without removing any liquidity.
  const transaction = await buildRemoveLiquidityTransaction(
    solana,
    positionNftMint,
    walletPubkey,
    new BN(0), // liquidity: collect fees only
    new BN(0), // amount0Min
    new BN(0), // amount1Min
    [baseToken.address, quoteToken.address], // unwrap a native-side fee rather than leaving it WSOL
    600000, // Compute units
  );

  // The wallet chokepoint simulates, sets the compute budget and priority fee, and signs
  // for the wallet's type (local keypair or Ledger).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error, so txData means confirmed.
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    const totalFee = txData.meta.fee;

    // No liquidity was removed, so the position tokens received are exactly the fees.
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    // Unwrapping closes the wrapped-SOL account, so its rent comes back in the same
    // native balance change as the fee, and a reward account the collection first creates
    // costs rent out of it. Rent is neither fee income nor a fee paid.
    const lifecycle = accountLifecycleSol(txData);
    const baseFeeCollected = receivedWithoutAccounts(balanceChanges[0], new PublicKey(baseToken.address), lifecycle);
    const quoteFeeCollected = receivedWithoutAccounts(balanceChanges[1], new PublicKey(quoteToken.address), lifecycle);

    logger.info(
      `Fees collected from position ${positionAddress}: ${baseFeeCollected.toFixed(6)} ${baseToken.symbol}, ` +
        `${quoteFeeCollected.toFixed(6)} ${quoteToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        // The pool this position belongs to, already loaded here. The unified route is
        // position-addressed and never receives it, so this is the only place it can
        // come from without a second lookup.
        poolAddress: positionInfo.poolAddress,
        fee: totalFee / 1e9,
        baseFeeAmountCollected: baseFeeCollected,
        quoteFeeAmountCollected: quoteFeeCollected,
      },
    };
  }

  // Confirmed, but not yet visible to the re-fetch: report it pending.
  return {
    signature,
    status: 0, // PENDING
  };
}

export { collectFees };

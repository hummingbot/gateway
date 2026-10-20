import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { accountLifecycleSol, receivedWithoutAccounts } from '../../../chains/solana/solana.utils';
import { RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSol, PANCAKESWAP_CLMM_PROGRAM_ID } from '../pancakeswap-sol';
import { parsePositionData } from '../pancakeswap-sol.parser';
import { buildRemoveLiquidityTransaction } from '../pancakeswap-sol.transactions';

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Validate percentage
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('Percentage must be between 0 and 100');
  }

  // Get position info
  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  // Get position account to extract liquidity
  const positionNftMint = new PublicKey(positionAddress);
  const [personalPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  const positionAccountInfo = await solana.connection.getAccountInfo(personalPosition);
  if (!positionAccountInfo) {
    throw httpErrors.notFound(`Position account not found: ${personalPosition.toString()}`);
  }

  const { liquidity } = parsePositionData(positionAccountInfo.data);

  // Calculate liquidity to remove
  const liquidityToRemove = new BN(new Decimal(liquidity.toString()).mul(percentageToRemove / 100).toFixed(0));

  logger.info(`Removing ${percentageToRemove}% liquidity from position ${positionAddress}`);
  logger.info(`Total liquidity: ${liquidity.toString()}, removing: ${liquidityToRemove.toString()}`);

  const walletPubkey = new PublicKey(walletAddress);

  // Get base and quote tokens
  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound('Token information not found');
  }

  // Build transaction (using 0 for min amounts - no slippage protection for now)
  const transaction = await buildRemoveLiquidityTransaction(
    solana,
    positionNftMint,
    walletPubkey,
    liquidityToRemove,
    new BN(0), // amount0Min
    new BN(0), // amount1Min
    [baseToken.address, quoteToken.address], // unwrap a native side rather than leaving it WSOL
    600000, // Compute units
  );

  // The wallet chokepoint simulates, sets the compute budget and priority fee, and signs
  // for the wallet's type (local keypair or Ledger).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error, so txData means confirmed.
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    // Unwrapping closes the wrapped-SOL account, so its rent — and any WSOL the wallet
    // was already holding in it — lands in the native balance change alongside the
    // withdrawal. The reward accounts the decrease may first create cost rent out of the
    // same change. None of that is liquidity this position gave back.
    const lifecycle = accountLifecycleSol(txData);
    const baseTokenChange = receivedWithoutAccounts(balanceChanges[0], new PublicKey(baseToken.address), lifecycle);
    const quoteTokenChange = receivedWithoutAccounts(balanceChanges[1], new PublicKey(quoteToken.address), lifecycle);

    logger.info(`Liquidity removed successfully. Signature: ${signature}`);
    logger.info(
      `Removed ${baseTokenChange.toFixed(4)} ${baseToken.symbol}, ${quoteTokenChange.toFixed(4)} ${quoteToken.symbol}`,
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
        baseTokenAmountRemoved: baseTokenChange,
        quoteTokenAmountRemoved: quoteTokenChange,
      },
    };
  }

  // Confirmed, but not yet visible to the re-fetch: report it pending.
  return {
    signature,
    status: 0, // PENDING
  };
}

import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
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

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);

  // Get base and quote tokens
  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound('Token information not found');
  }

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction (using 0 for min amounts - no slippage protection for now)
  const transaction = await buildRemoveLiquidityTransaction(
    solana,
    positionNftMint,
    walletPubkey,
    liquidityToRemove,
    new BN(0), // amount0Min
    new BN(0), // amount1Min
    600000, // Compute units
    priorityFeePerCU,
  );

  // Sign and send
  transaction.sign([wallet]);
  await solana.simulateWithErrorHandling(transaction);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    const baseTokenChange = balanceChanges[0];
    const quoteTokenChange = balanceChanges[1];

    logger.info(`Liquidity removed successfully. Signature: ${signature}`);
    logger.info(
      `Removed ${Math.abs(baseTokenChange).toFixed(4)} ${baseToken.symbol}, ${Math.abs(quoteTokenChange).toFixed(4)} ${quoteToken.symbol}`,
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
        baseTokenAmountRemoved: Math.abs(baseTokenChange),
        quoteTokenAmountRemoved: Math.abs(quoteTokenChange),
      },
    };
  }

  // A landed-but-failed transaction is terminal: fail loudly instead of returning
  // PENDING (callers would poll forever). Genuinely-not-landed keeps the pending shape.
  await solana.throwIfLandedWithError(signature, txData);

  return {
    signature,
    status: 0, // PENDING
  };
}

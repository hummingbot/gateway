import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import {
  accountLifecycleSol,
  liquidityWithoutRent,
  transfersByProgramInstruction,
} from '../../../chains/solana/solana.utils';
import { ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSol, PANCAKESWAP_CLMM_PROGRAM_ID } from '../pancakeswap-sol';
import { buildDecreaseLiquidityV2Instruction, buildClosePositionInstruction } from '../pancakeswap-sol.instructions';
import { parsePositionData } from '../pancakeswap-sol.parser';
import { buildTransactionWithInstructions, buildUnwrapSolInstructions } from '../pancakeswap-sol.transactions';

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Validate position exists and get info
  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const positionNftMint = new PublicKey(positionAddress);

  // Get position account to read actual liquidity
  const [personalPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  const positionAccountInfo = await solana.connection.getAccountInfo(personalPosition);
  if (!positionAccountInfo) {
    throw httpErrors.notFound(`Position account not found: ${personalPosition.toString()}`);
  }

  // Parse position data to get liquidity (like removeLiquidity.ts)
  const { liquidity } = parsePositionData(positionAccountInfo.data);
  const hasLiquidity = liquidity.gt(new BN(0));

  logger.info(`Closing position ${positionAddress}, has liquidity: ${hasLiquidity}`);
  if (hasLiquidity) {
    logger.info(`  Liquidity: ${liquidity.toString()} (will be removed)`);
  }

  // Get tokens for balance tracking
  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound('Token information not found');
  }

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction with both instructions (like successful manual transaction)
  const instructions = [];

  // 1. Collect the fees on their own, THEN remove the liquidity.
  //
  // This program moves a position's fees and its principal in the same
  // `decrease_liquidity_v2` transfer, so a single instruction leaves the two
  // inseparable — which is why this route reported fees of 0 and a principal that
  // silently contained them. A zero-liquidity decrease collects the fees and touches
  // nothing else (it is exactly what the collect-fees route does), so the two land in
  // different top-level instructions and the transaction says which is which.
  if (hasLiquidity) {
    const collectFeesIx = await buildDecreaseLiquidityV2Instruction(
      solana,
      positionNftMint,
      walletPubkey,
      new BN(0), // liquidity: fees only
      new BN(0), // amount0Min
      new BN(0), // amount1Min
    );
    instructions.push(collectFeesIx);

    const removeLiquidityIx = await buildDecreaseLiquidityV2Instruction(
      solana,
      positionNftMint,
      walletPubkey,
      liquidity, // Remove all liquidity (already a BN)
      new BN(0), // amount0Min = 0 (accept any amount)
      new BN(0), // amount1Min = 0
    );
    instructions.push(removeLiquidityIx);
  }

  // 2. Close position and burn NFT
  const closePositionIx = await buildClosePositionInstruction(solana, positionNftMint, walletPubkey);
  instructions.push(closePositionIx);

  // 3. Unwrap what the withdrawal paid out in WSOL. Without this the SOL never reaches
  // the native balance, and the only thing that moves it is the rent — which is exactly
  // how this route came to report the rent as the liquidity withdrawn.
  instructions.push(...buildUnwrapSolInstructions(solana, walletPubkey, [baseToken.address, quoteToken.address]));

  // Build complete transaction
  const transaction = await buildTransactionWithInstructions(
    solana,
    walletPubkey,
    instructions,
    800000, // Compute units for both operations
    priorityFeePerCU,
  );

  // Sign and send
  transaction.sign([wallet]);
  await solana.simulateWithErrorHandling(transaction);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { balanceChanges, txDetails } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    // Closing gives back the rent of every account that closed — the position, its NFT
    // account, the tick array if this was the last position in it, and the wrapped-SOL
    // account the unwrap above closes. All of it arrives in the same native balance
    // change as the withdrawal, and none of it is liquidity.
    const { closed, rentRefunded } = accountLifecycleSol(txData);
    const baseTokenChange = liquidityWithoutRent(balanceChanges[0], new PublicKey(baseToken.address), closed);
    const quoteTokenChange = liquidityWithoutRent(balanceChanges[1], new PublicKey(quoteToken.address), closed);

    // The fee-collecting instruction is the first of this program's instructions in the
    // transaction, so its transfers are the fees and nothing else. Taken from the
    // transaction rather than from a balance change, which cannot separate them.
    //
    // An unreadable transaction leaves this at zero and the amounts whole, which is what
    // this route did for every close before now — a known shape, not a new silence.
    const [collected = [0, 0]] = transfersByProgramInstruction(txDetails, PANCAKESWAP_CLMM_PROGRAM_ID.toBase58(), [
      baseToken.address,
      quoteToken.address,
    ]);
    const baseFeeCollected = hasLiquidity ? collected[0] : 0;
    const quoteFeeCollected = hasLiquidity ? collected[1] : 0;

    logger.info(`Position closed successfully. Signature: ${signature}`);
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
        positionRentRefunded: rentRefunded,
        // Principal is what came back less what the fee instruction paid out. Both
        // arrive in the same balance change, so the subtraction is what keeps fee
        // income out of the position's returned capital. Clamped at zero rather than
        // publishing a negative quantity of tokens if the two measures ever disagree.
        baseTokenAmountRemoved: Math.max(0, baseTokenChange - baseFeeCollected),
        quoteTokenAmountRemoved: Math.max(0, quoteTokenChange - quoteFeeCollected),
        baseFeeAmountCollected: baseFeeCollected,
        quoteFeeAmountCollected: quoteFeeCollected,
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

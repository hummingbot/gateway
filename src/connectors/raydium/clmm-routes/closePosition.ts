import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

import { removeLiquidity } from './removeLiquidity';

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await Raydium.getInstance(network);

    // Set the SDK owner to the wallet's public key — works for every wallet type (local,
    // hardware). The tx is built unsigned; signing/sending is delegated to
    // sendAndConfirmTransactionForWallet, which signs for the wallet's type.
    await raydium.setOwner(new PublicKey(walletAddress));

    const position = await raydium.getClmmPosition(positionAddress);

    // Handle positions with remaining liquidity first
    if (!position.liquidity.isZero()) {
      const [poolInfo] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());
      const baseTokenInfo = await solana.getToken(poolInfo.mintA.address);
      const quoteTokenInfo = await solana.getToken(poolInfo.mintB.address);

      // When closePosition: true, the SDK removes liquidity AND collects fees in one transaction
      const removeLiquidityResponse = await removeLiquidity(network, walletAddress, positionAddress, 100, true);

      if (removeLiquidityResponse.status === 1 && removeLiquidityResponse.data) {
        // Use the new helper to extract balance changes including SOL handling
        const { baseTokenChange, quoteTokenChange, rent } = await solana.extractClmmBalanceChanges(
          removeLiquidityResponse.signature,
          walletAddress,
          baseTokenInfo,
          quoteTokenInfo,
        );

        // The total balance change includes both liquidity removal and fee collection
        // Since we know the liquidity amounts from removeLiquidity response,
        // we can calculate the fee amounts
        const baseFeeCollected = Math.abs(baseTokenChange) - removeLiquidityResponse.data.baseTokenAmountRemoved;
        const quoteFeeCollected = Math.abs(quoteTokenChange) - removeLiquidityResponse.data.quoteTokenAmountRemoved;

        return {
          signature: removeLiquidityResponse.signature,
          status: removeLiquidityResponse.status,
          data: {
            // The pool this position belongs to, already loaded here. The unified route is
            // position-addressed and never receives it, so this is the only place it can
            // come from without a second lookup.
            poolAddress: position.poolId.toBase58(),
            fee: removeLiquidityResponse.data.fee,
            positionRentRefunded: rent,
            baseTokenAmountRemoved: removeLiquidityResponse.data.baseTokenAmountRemoved,
            quoteTokenAmountRemoved: removeLiquidityResponse.data.quoteTokenAmountRemoved,
            baseFeeAmountCollected: Math.max(0, baseFeeCollected),
            quoteFeeAmountCollected: Math.max(0, quoteFeeCollected),
          },
        };
      } else {
        // Return pending status without data
        return {
          signature: removeLiquidityResponse.signature,
          status: removeLiquidityResponse.status,
        };
      }
    }

    // Original close position logic for empty positions
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());
    logger.debug('Pool Info:', poolInfo);

    // Use hardcoded compute units for close position
    const COMPUTE_UNITS = 200000;

    // Get priority fee from solana (returns lamports/CU)
    const priorityFeeInLamports = await solana.estimateGasPrice();
    // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    const result = await raydium.raydiumSDK.clmm.closePosition({
      poolInfo,
      poolKeys,
      ownerPosition: position,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    });

    logger.info('Close position transaction created:', result.transaction);

    // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
    // simulates internally).
    const { signature } = await solana.sendAndConfirmTransactionForWallet(result.transaction, walletAddress);
    // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
    // landed with an error, so txData existing below really means "confirmed".
    const txData = await solana.getConfirmedTransactionData(signature);
    const confirmed = txData !== null;

    if (!confirmed || !txData) {
      throw httpErrors.internalServerError('Transaction failed to confirm');
    }

    const fee = (txData.meta?.fee || 0) * (1 / Math.pow(10, 9)); // Convert lamports to SOL

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      'So11111111111111111111111111111111111111112',
    ]);
    const rentRefunded = Math.abs(balanceChanges[0]);

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee,
        positionRentRefunded: rentRefunded,
        baseTokenAmountRemoved: 0,
        quoteTokenAmountRemoved: 0,
        baseFeeAmountCollected: 0,
        quoteFeeAmountCollected: 0,
      },
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

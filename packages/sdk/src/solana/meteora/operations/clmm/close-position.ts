/**
 * Meteora Close Position Operation
 *
 * Closes a Meteora DLMM position by:
 * 1. Removing all liquidity
 * 2. Collecting all fees
 * 3. Closing the position account to reclaim rent
 *
 * Implements the OperationBuilder pattern for transaction operations.
 */

import { PublicKey } from '@solana/web3.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { ClosePositionParams, ClosePositionResult } from '../../types';
import { RemoveLiquidityOperation } from './remove-liquidity';
import { CollectFeesOperation } from './collect-fees';

/**
 * Close Position Operation
 *
 * Completely closes a position by removing liquidity, collecting fees, and reclaiming rent.
 */
export class ClosePositionOperation implements OperationBuilder<ClosePositionParams, ClosePositionResult> {
  private removeLiquidityOp: RemoveLiquidityOperation;
  private collectFeesOp: CollectFeesOperation;

  constructor(
    private meteora: any, // Meteora connector
    private solana: any,  // Solana chain
  ) {
    this.removeLiquidityOp = new RemoveLiquidityOperation(meteora, solana);
    this.collectFeesOp = new CollectFeesOperation(meteora, solana);
  }

  /**
   * Validate parameters
   */
  async validate(params: ClosePositionParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Required parameters
    if (!params.walletAddress) errors.push('Wallet address is required');
    if (!params.positionAddress) errors.push('Position address is required');

    // Validate addresses
    try {
      if (params.positionAddress) new PublicKey(params.positionAddress);
    } catch {
      errors.push(`Invalid position address: ${params.positionAddress}`);
    }

    try {
      if (params.walletAddress) new PublicKey(params.walletAddress);
    } catch {
      errors.push(`Invalid wallet address: ${params.walletAddress}`);
    }

    // Check position exists
    if (params.positionAddress && params.walletAddress) {
      try {
        const wallet = await this.solana.getWallet(params.walletAddress);
        const positionResult = await this.meteora.getRawPosition(params.positionAddress, wallet.publicKey);
        if (!positionResult || !positionResult.position) {
          errors.push(`Position not found: ${params.positionAddress}`);
        }
      } catch (error: any) {
        errors.push(`Error fetching position: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Simulate transaction
   */
  async simulate(params: ClosePositionParams): Promise<SimulationResult> {
    try {
      const transaction = await this.build(params);

      // Simulate on-chain
      await this.solana.connection.simulateTransaction(transaction.raw);

      return {
        success: true,
        changes: {
          balanceChanges: [
            { token: 'SOL', amount: '0', direction: 'in' }, // Rent reclaimed
          ],
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Simulation failed: ${error.message}`,
      };
    }
  }

  /**
   * Build transaction (only the close position transaction)
   */
  async build(params: ClosePositionParams): Promise<SDKTransaction> {
    const { walletAddress, positionAddress } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await this.meteora.getDlmmPool(info.publicKey.toBase58());

    const closePositionTx = await dlmmPool.closePosition({
      owner: wallet.publicKey,
      position: position,
    });

    return {
      raw: closePositionTx,
      description: `Close position ${positionAddress}`,
    };
  }

  /**
   * Execute transaction
   *
   * This is a multi-step process:
   * 1. Remove all liquidity if any exists
   * 2. Collect all fees if any exist
   * 3. Close the position account
   */
  async execute(params: ClosePositionParams): Promise<ClosePositionResult> {
    const { walletAddress, positionAddress } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionInfo = await this.meteora.getPositionInfo(positionAddress, wallet.publicKey);
    const dlmmPool = await this.meteora.getDlmmPool(positionInfo.poolAddress);

    // Step 1: Remove liquidity if any exists
    let baseTokenAmountRemoved = 0;
    let quoteTokenAmountRemoved = 0;
    let removeLiquidityFee = 0;

    if (positionInfo.baseTokenAmount > 0 || positionInfo.quoteTokenAmount > 0) {
      const removeLiquidityResult = await this.removeLiquidityOp.execute({
        network: params.network,
        walletAddress,
        positionAddress,
        percentageToRemove: 100,
      });

      if (removeLiquidityResult.status === 1 && removeLiquidityResult.data) {
        baseTokenAmountRemoved = removeLiquidityResult.data.baseTokenAmountRemoved;
        quoteTokenAmountRemoved = removeLiquidityResult.data.quoteTokenAmountRemoved;
        removeLiquidityFee = removeLiquidityResult.data.fee;
      }
    }

    // Step 2: Collect fees if any exist
    let baseFeesClaimed = 0;
    let quoteFeesClaimed = 0;
    let collectFeesFee = 0;

    if (positionInfo.baseFeeAmount > 0 || positionInfo.quoteFeeAmount > 0) {
      const collectFeesResult = await this.collectFeesOp.execute({
        network: params.network,
        walletAddress,
        positionAddress,
      });

      if (collectFeesResult.status === 1 && collectFeesResult.data) {
        baseFeesClaimed = collectFeesResult.data.baseFeesClaimed;
        quoteFeesClaimed = collectFeesResult.data.quoteFeesClaimed;
        collectFeesFee = collectFeesResult.data.fee;
      }
    }

    // Step 3: Close the position
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position } = positionResult;

    const closePositionTx = await dlmmPool.closePosition({
      owner: wallet.publicKey,
      position: position,
    });

    closePositionTx.feePayer = wallet.publicKey;

    // Send and confirm
    const { signature, fee } = await this.solana.sendAndConfirmTransaction(
      closePositionTx,
      [wallet],
      400000, // Higher compute units for close position
    );

    // Get transaction data for confirmation
    const txData = await this.solana.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    const confirmed = txData !== null;

    if (confirmed && txData) {
      // Extract SOL rent reclaimed
      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(
        signature,
        wallet.publicKey.toBase58(),
        ['So11111111111111111111111111111111111111112'], // SOL mint
      );

      const rentReclaimed = Math.abs(balanceChanges[0]);
      const totalFee = fee + removeLiquidityFee + collectFeesFee;

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee: totalFee,
          baseTokenAmountRemoved,
          quoteTokenAmountRemoved,
          baseFeesClaimed,
          quoteFeesClaimed,
          rentReclaimed,
        },
      };
    }

    return {
      signature,
      status: 0, // PENDING
    };
  }
}

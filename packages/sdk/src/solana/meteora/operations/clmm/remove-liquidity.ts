/**
 * Meteora Remove Liquidity Operation
 *
 * Removes liquidity from an existing Meteora DLMM position.
 * Implements the OperationBuilder pattern for transaction operations.
 */

import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { RemoveLiquidityParams, RemoveLiquidityResult } from '../../types';

/**
 * Remove Liquidity Operation
 *
 * Withdraws liquidity from an existing position based on percentage.
 */
export class RemoveLiquidityOperation implements OperationBuilder<RemoveLiquidityParams, RemoveLiquidityResult> {
  constructor(
    private meteora: any, // Meteora connector
    private solana: any,  // Solana chain
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: RemoveLiquidityParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Required parameters
    if (!params.walletAddress) errors.push('Wallet address is required');
    if (!params.positionAddress) errors.push('Position address is required');
    if (params.percentageToRemove === undefined) errors.push('Percentage to remove is required');

    // Validate percentage range
    if (params.percentageToRemove !== undefined && (params.percentageToRemove <= 0 || params.percentageToRemove > 100)) {
      errors.push('Percentage to remove must be between 0 and 100');
    }

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
  async simulate(params: RemoveLiquidityParams): Promise<SimulationResult> {
    try {
      const transaction = await this.build(params);

      // Simulate on-chain (handle single transaction only for now)
      await this.solana.connection.simulateTransaction(transaction.raw);

      return {
        success: true,
        changes: {
          balanceChanges: [
            { token: 'base', amount: '0', direction: 'in' },
            { token: 'quote', amount: '0', direction: 'in' },
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
   * Build transaction
   */
  async build(params: RemoveLiquidityParams): Promise<SDKTransaction> {
    const { walletAddress, positionAddress, percentageToRemove } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await this.meteora.getDlmmPool(info.publicKey.toBase58());

    const binIdsToRemove = position.positionData.positionBinData.map((bin: any) => bin.binId);
    const bps = new BN(percentageToRemove * 100);

    const removeLiquidityTx = await dlmmPool.removeLiquidity({
      position: position.publicKey,
      user: wallet.publicKey,
      binIds: binIdsToRemove,
      bps: bps,
      shouldClaimAndClose: false,
    });

    // Handle both single transaction and array of transactions
    // For now, return the first transaction for build()
    const tx = Array.isArray(removeLiquidityTx) ? removeLiquidityTx[0] : removeLiquidityTx;

    // Store all transactions if it's an array for later use in execute
    if (Array.isArray(removeLiquidityTx)) {
      (tx as any).__allTransactions = removeLiquidityTx;
    }

    return {
      raw: tx,
      description: `Remove ${percentageToRemove}% liquidity from position ${positionAddress}`,
    };
  }

  /**
   * Execute transaction
   */
  async execute(params: RemoveLiquidityParams): Promise<RemoveLiquidityResult> {
    const { walletAddress, positionAddress, percentageToRemove } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await this.meteora.getDlmmPool(info.publicKey.toBase58());

    const binIdsToRemove = position.positionData.positionBinData.map((bin: any) => bin.binId);
    const bps = new BN(percentageToRemove * 100);

    const removeLiquidityTx = await dlmmPool.removeLiquidity({
      position: position.publicKey,
      user: wallet.publicKey,
      binIds: binIdsToRemove,
      bps: bps,
      shouldClaimAndClose: false,
    });

    // Handle both single transaction and array of transactions
    let signature: string;
    let fee: number;

    if (Array.isArray(removeLiquidityTx)) {
      let totalFee = 0;
      let lastSignature = '';

      for (let i = 0; i < removeLiquidityTx.length; i++) {
        const tx = removeLiquidityTx[i];
        tx.feePayer = wallet.publicKey;

        const result = await this.solana.sendAndConfirmTransaction(tx, [wallet]);
        totalFee += result.fee;
        lastSignature = result.signature;
      }

      signature = lastSignature;
      fee = totalFee;
    } else {
      removeLiquidityTx.feePayer = wallet.publicKey;
      const result = await this.solana.sendAndConfirmTransaction(removeLiquidityTx, [wallet]);
      signature = result.signature;
      fee = result.fee;
    }

    // Get transaction data for confirmation
    const txData = await this.solana.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    const confirmed = txData !== null;

    if (confirmed && txData) {
      // Extract balance changes
      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(
        signature,
        dlmmPool.pubkey.toBase58(),
        [dlmmPool.tokenX.publicKey.toBase58(), dlmmPool.tokenY.publicKey.toBase58()],
      );

      const baseTokenAmountRemoved = Math.abs(balanceChanges[0]);
      const quoteTokenAmountRemoved = Math.abs(balanceChanges[1]);

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee,
          baseTokenAmountRemoved,
          quoteTokenAmountRemoved,
        },
      };
    }

    return {
      signature,
      status: 0, // PENDING
    };
  }
}

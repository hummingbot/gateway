/**
 * Meteora Collect Fees Operation
 *
 * Collects accumulated swap fees from a Meteora DLMM position.
 * Implements the OperationBuilder pattern for transaction operations.
 */

import { PublicKey } from '@solana/web3.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { CollectFeesParams, CollectFeesResult } from '../../types';

/**
 * Collect Fees Operation
 *
 * Claims swap fees that have accumulated in a liquidity position.
 */
export class CollectFeesOperation implements OperationBuilder<CollectFeesParams, CollectFeesResult> {
  constructor(
    private meteora: any, // Meteora connector
    private solana: any,  // Solana chain
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: CollectFeesParams): Promise<ValidationResult> {
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
  async simulate(params: CollectFeesParams): Promise<SimulationResult> {
    try {
      const transaction = await this.build(params);

      // Simulate on-chain
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
  async build(params: CollectFeesParams): Promise<SDKTransaction> {
    const { walletAddress, positionAddress } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await this.meteora.getDlmmPool(info.publicKey.toBase58());

    if (!dlmmPool) {
      throw new Error(`Pool not found for position: ${positionAddress}`);
    }

    const claimSwapFeeTx = await dlmmPool.claimSwapFee({
      owner: wallet.publicKey,
      position: position,
    });

    return {
      raw: claimSwapFeeTx,
      description: `Collect fees from position ${positionAddress}`,
    };
  }

  /**
   * Execute transaction
   */
  async execute(params: CollectFeesParams): Promise<CollectFeesResult> {
    const { walletAddress, positionAddress } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await this.meteora.getDlmmPool(info.publicKey.toBase58());

    if (!dlmmPool) {
      throw new Error(`Pool not found for position: ${positionAddress}`);
    }

    // Build transaction
    const transaction = await this.build(params);
    transaction.raw.feePayer = wallet.publicKey;

    // Send and confirm
    const { signature, fee } = await this.solana.sendAndConfirmTransaction(
      transaction.raw,
      [wallet],
    );

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

      const baseFeesClaimed = Math.abs(balanceChanges[0]);
      const quoteFeesClaimed = Math.abs(balanceChanges[1]);

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee,
          baseFeesClaimed,
          quoteFeesClaimed,
        },
      };
    }

    return {
      signature,
      status: 0, // PENDING
    };
  }
}

/**
 * Raydium CLMM Collect Fees Operation
 *
 * Implements the OperationBuilder pattern for collecting accumulated fees from positions.
 * Uses the removeLiquidity operation with a small percentage (1%) to trigger fee collection.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { CollectFeesParams, CollectFeesResult } from '../../types/clmm';

/**
 * Collect Fees Operation
 *
 * Implements OperationBuilder for collecting fees from CLMM positions.
 * Works by removing 1% of liquidity which triggers fee collection.
 */
export class CollectFeesOperation
  implements OperationBuilder<CollectFeesParams, CollectFeesResult>
{
  constructor(
    private raydium: any, // Will be typed properly with RaydiumConnector
    private solana: any, // Solana chain instance
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: CollectFeesParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate wallet address
    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    // Validate position address
    if (!params.positionAddress || params.positionAddress.length === 0) {
      errors.push('Position address is required');
    }

    // Check if position exists
    try {
      const position = await this.raydium.getClmmPosition(params.positionAddress);
      if (!position) {
        errors.push(`Position not found: ${params.positionAddress}`);
      }
    } catch (error: any) {
      errors.push(`Failed to fetch position: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Simulate transaction
   *
   * Returns estimated fees to be collected
   */
  async simulate(params: CollectFeesParams): Promise<SimulationResult> {
    try {
      // Get priority fee estimate
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = 600000;
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      return {
        success: true,
        changes: {
          balanceChanges: [
            {
              token: 'BASE',
              amount: 'TBD', // Depends on accumulated fees
              direction: 'in',
              note: 'Fees collected',
            },
            {
              token: 'QUOTE',
              amount: 'TBD', // Depends on accumulated fees
              direction: 'in',
              note: 'Fees collected',
            },
          ],
        },
        estimatedFee: {
          amount: estimatedFee.toString(),
          token: 'SOL',
        },
        metadata: {
          note: 'Collects fees by removing 1% of liquidity',
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
   * Build unsigned transaction
   */
  async build(params: CollectFeesParams): Promise<SDKTransaction> {
    // Delegate to removeLiquidity operation with 1% to collect fees
    const { removeLiquidity } = await import(
      '../../../../../../src/connectors/raydium/clmm-routes/removeLiquidity'
    );

    // Note: This uses the route function temporarily
    // In a full SDK implementation, this would use RemoveLiquidityOperation
    throw new Error('Build not yet implemented for CollectFees - use execute() instead');
  }

  /**
   * Execute transaction (signs and submits)
   */
  async execute(params: CollectFeesParams): Promise<CollectFeesResult> {
    // Use removeLiquidity helper to collect fees (removes 1% liquidity)
    const { removeLiquidity } = await import(
      '../../../../../../src/connectors/raydium/clmm-routes/removeLiquidity'
    );

    const removeLiquidityResponse = await removeLiquidity(
      null,
      params.network,
      params.walletAddress,
      params.positionAddress,
      1, // Remove 1% of liquidity to collect fees
      false, // Don't close position
    );

    if (removeLiquidityResponse.status === 1 && removeLiquidityResponse.data) {
      const position = await this.raydium.getClmmPosition(params.positionAddress);
      const [poolInfo] = await this.raydium.getClmmPoolfromAPI(position.poolId.toBase58());

      const tokenA = await this.solana.getToken(poolInfo.mintA.address);
      const tokenB = await this.solana.getToken(poolInfo.mintB.address);

      // Extract balance changes
      const { baseTokenChange, quoteTokenChange } = await this.solana.extractClmmBalanceChanges(
        removeLiquidityResponse.signature,
        params.walletAddress,
        tokenA,
        tokenB,
        removeLiquidityResponse.data.fee * 1e9,
      );

      // Calculate fees collected (total change - liquidity removed)
      const baseFeeCollected =
        Math.abs(baseTokenChange) - removeLiquidityResponse.data.baseTokenAmountRemoved;
      const quoteFeeCollected =
        Math.abs(quoteTokenChange) - removeLiquidityResponse.data.quoteTokenAmountRemoved;

      return {
        signature: removeLiquidityResponse.signature,
        status: 1, // CONFIRMED
        data: {
          fee: removeLiquidityResponse.data.fee,
          baseFeeCollected: Math.max(0, baseFeeCollected),
          quoteFeeCollected: Math.max(0, quoteFeeCollected),
        },
      };
    } else {
      return {
        signature: removeLiquidityResponse.signature,
        status: 0, // PENDING
      };
    }
  }
}

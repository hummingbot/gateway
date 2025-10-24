/**
 * Raydium CLMM Execute Swap Operation
 *
 * Implements the OperationBuilder pattern for executing swaps on Raydium CLMM pools.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import { VersionedTransaction } from '@solana/web3.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { ExecuteSwapParams, ExecuteSwapResult } from '../../types/clmm';

/**
 * Execute Swap Operation
 *
 * Implements OperationBuilder for executing swaps on CLMM pools.
 */
export class ExecuteSwapOperation implements OperationBuilder<ExecuteSwapParams, ExecuteSwapResult> {
  constructor(
    private raydium: any, // Will be typed properly with RaydiumConnector
    private solana: any, // Solana chain instance
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: ExecuteSwapParams): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!params.poolAddress || params.poolAddress.length === 0) {
      errors.push('Pool address is required');
    }

    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    if (!params.tokenIn || params.tokenIn.length === 0) {
      errors.push('Input token is required');
    }

    if (!params.tokenOut || params.tokenOut.length === 0) {
      errors.push('Output token is required');
    }

    if (!params.amountIn && !params.amountOut) {
      errors.push('Either amountIn or amountOut must be provided');
    }

    if (params.amountIn && params.amountOut) {
      errors.push('Cannot specify both amountIn and amountOut');
    }

    if (params.amountIn !== undefined && params.amountIn <= 0) {
      errors.push('Amount in must be positive');
    }

    if (params.amountOut !== undefined && params.amountOut <= 0) {
      errors.push('Amount out must be positive');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Simulate transaction
   */
  async simulate(params: ExecuteSwapParams): Promise<SimulationResult> {
    try {
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = 600000;
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      return {
        success: true,
        changes: {
          balanceChanges: [
            {
              token: params.tokenIn,
              amount: (params.amountIn || 'TBD').toString(),
              direction: 'out',
            },
            {
              token: params.tokenOut,
              amount: (params.amountOut || 'TBD').toString(),
              direction: 'in',
            },
          ],
        },
        estimatedFee: {
          amount: estimatedFee.toString(),
          token: 'SOL',
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
  async build(params: ExecuteSwapParams): Promise<SDKTransaction> {
    // Note: CLMM executeSwap is complex with multiple SDK types
    // For now, delegate to the route function
    throw new Error('Build not yet fully implemented for CLMM executeSwap - use execute() instead');
  }

  /**
   * Execute transaction
   */
  async execute(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
    // Delegate to existing route function temporarily
    // In a full SDK implementation, this would be self-contained
    const { executeSwap: routeExecuteSwap } = await import(
      '../../../../../../src/connectors/raydium/clmm-routes/executeSwap'
    );

    const side: 'BUY' | 'SELL' = params.amountIn !== undefined ? 'SELL' : 'BUY';
    const amount = params.amountIn !== undefined ? params.amountIn : params.amountOut!;

    return await routeExecuteSwap(
      null,
      params.network,
      params.walletAddress,
      params.tokenIn, // baseToken
      params.tokenOut, // quoteToken
      amount,
      side,
      params.poolAddress,
      params.slippagePct,
    );
  }
}

/**
 * Raydium AMM Execute Swap Operation
 *
 * Implements the OperationBuilder pattern for executing swaps on Raydium AMM/CPMM pools.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { ExecuteSwapParams, ExecuteSwapResult } from '../../types/amm';
import { quoteSwap } from './quote-swap';

/**
 * Execute Swap Operation
 *
 * Implements OperationBuilder for executing swaps on Raydium pools.
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

    // Validate pool address
    if (!params.poolAddress || params.poolAddress.length === 0) {
      errors.push('Pool address is required');
    }

    // Validate wallet address
    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    // Validate token addresses
    if (!params.tokenIn || params.tokenIn.length === 0) {
      errors.push('Input token is required');
    }

    if (!params.tokenOut || params.tokenOut.length === 0) {
      errors.push('Output token is required');
    }

    // Validate amounts (must have either amountIn or amountOut)
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

    // Validate slippage
    if (params.slippagePct !== undefined) {
      if (params.slippagePct < 0 || params.slippagePct > 100) {
        errors.push('Slippage must be between 0 and 100');
      }
    }

    // Check if pool exists
    try {
      const poolInfo = await this.raydium.getAmmPoolInfo(params.poolAddress);
      if (!poolInfo) {
        errors.push(`Pool not found: ${params.poolAddress}`);
      }
    } catch (error: any) {
      errors.push(`Failed to fetch pool info: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Simulate transaction
   *
   * Returns expected swap amounts and price impact
   */
  async simulate(params: ExecuteSwapParams): Promise<SimulationResult> {
    try {
      // Get quote for swap
      const quote = await quoteSwap(this.raydium, this.solana, {
        network: params.network,
        poolAddress: params.poolAddress,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: params.amountOut,
        slippagePct: params.slippagePct,
      });

      // Get priority fee estimate
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = 300000;
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      return {
        success: true,
        changes: {
          balanceChanges: [
            {
              token: params.tokenIn,
              amount: quote.amountIn.toString(),
              direction: 'out',
            },
            {
              token: params.tokenOut,
              amount: quote.amountOut.toString(),
              direction: 'in',
            },
          ],
        },
        estimatedFee: {
          amount: estimatedFee.toString(),
          token: 'SOL',
        },
        metadata: {
          price: quote.price,
          priceImpact: quote.priceImpactPct,
          minAmountOut: quote.minAmountOut,
          maxAmountIn: quote.maxAmountIn,
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
    // Get pool info
    const poolInfo = await this.raydium.getAmmPoolInfo(params.poolAddress);
    if (!poolInfo) {
      throw new Error(`Pool not found: ${params.poolAddress}`);
    }

    // Get quote using SDK quote operation
    const side: 'BUY' | 'SELL' = params.amountIn !== undefined ? 'SELL' : 'BUY';
    const amount = params.amountIn !== undefined ? params.amountIn : params.amountOut!;
    const effectiveSlippage = params.slippagePct || 1;

    // Use the internal quote helper from the route file
    // @ts-expect-error - Circular dependency, will be refactored in future PR
    const { getRawSwapQuote } = await import(
      '../../../../../../src/connectors/raydium/amm-routes/quoteSwap'
    );
    const quote = await getRawSwapQuote(
      this.raydium,
      params.network,
      params.poolAddress,
      params.tokenIn,
      params.tokenOut,
      amount,
      side,
      effectiveSlippage,
    );

    // Get priority fee
    const COMPUTE_UNITS = 300000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    let transaction: VersionedTransaction;

    // Get transaction based on pool type
    if (poolInfo.poolType === 'amm') {
      if (side === 'BUY') {
        // AMM swap base out (exact output)
        ({ transaction } = (await this.raydium.raydiumSDK.liquidity.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          amountIn: quote.maxAmountIn,
          amountOut: new BN(quote.amountOut),
          fixedSide: 'out',
          inputMint: quote.inputToken.address,
          txVersion: this.raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        })) as { transaction: VersionedTransaction });
      } else {
        // AMM swap (exact input)
        ({ transaction } = (await this.raydium.raydiumSDK.liquidity.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          amountIn: new BN(quote.amountIn),
          amountOut: quote.minAmountOut,
          fixedSide: 'in',
          inputMint: quote.inputToken.address,
          txVersion: this.raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        })) as { transaction: VersionedTransaction });
      }
    } else if (poolInfo.poolType === 'cpmm') {
      if (side === 'BUY') {
        // CPMM swap base out (exact output)
        ({ transaction } = (await this.raydium.raydiumSDK.cpmm.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          inputAmount: new BN(0), // not used when fixedOut is true
          fixedOut: true,
          swapResult: {
            sourceAmountSwapped: quote.amountIn,
            destinationAmountSwapped: new BN(quote.amountOut),
          },
          slippage: effectiveSlippage / 100,
          baseIn: quote.inputToken.address === quote.poolInfo.mintA.address,
          txVersion: this.raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        })) as { transaction: VersionedTransaction });
      } else {
        // CPMM swap (exact input)
        ({ transaction } = (await this.raydium.raydiumSDK.cpmm.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          inputAmount: quote.amountIn,
          swapResult: {
            sourceAmountSwapped: quote.amountIn,
            destinationAmountSwapped: quote.amountOut,
          },
          slippage: effectiveSlippage / 100,
          baseIn: quote.inputToken.address === quote.poolInfo.mintA.address,
          txVersion: this.raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        })) as { transaction: VersionedTransaction });
      }
    } else {
      throw new Error(`Unsupported pool type: ${poolInfo.poolType}`);
    }

    // Calculate estimated fee
    const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

    return {
      raw: transaction,
      description: `Swap ${side === 'SELL' ? amount : 'for'} ${params.tokenIn} ${side === 'SELL' ? 'for' : amount} ${params.tokenOut}`,
      estimatedFee: {
        amount: estimatedFee.toString(),
        token: 'SOL',
      },
    };
  }

  /**
   * Execute transaction (signs and submits)
   */
  async execute(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
    // Build transaction
    const tx = await this.build(params);
    const transaction = tx.raw as VersionedTransaction;

    // Prepare wallet
    const { wallet, isHardwareWallet } = await this.raydium.prepareWallet(params.walletAddress);

    // Sign transaction
    const signedTransaction = (await this.raydium.signTransaction(
      transaction,
      params.walletAddress,
      isHardwareWallet,
      wallet,
    )) as VersionedTransaction;

    // Simulate before sending
    await this.solana.simulateWithErrorHandling(signedTransaction, null);

    // Send and confirm
    const { confirmed, signature, txData } = await this.solana.sendAndConfirmRawTransaction(
      signedTransaction,
    );

    // Resolve token info for balance changes
    const inputToken = await this.solana.getToken(params.tokenIn);
    const outputToken = await this.solana.getToken(params.tokenOut);

    // Handle confirmation status
    const side: 'BUY' | 'SELL' = params.amountIn !== undefined ? 'SELL' : 'BUY';
    const result = await this.solana.handleConfirmation(
      signature,
      confirmed,
      txData,
      inputToken.address,
      outputToken.address,
      params.walletAddress,
      side,
    );

    return result as ExecuteSwapResult;
  }
}

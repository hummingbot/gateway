/**
 * Meteora Execute Swap Operation
 *
 * Executes a swap on a Meteora DLMM pool.
 * Implements the OperationBuilder pattern for transaction operations.
 */

import { SwapQuote, SwapQuoteExactOut } from '@meteora-ag/dlmm';
import { PublicKey, Transaction } from '@solana/web3.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { ExecuteSwapParams, ExecuteSwapResult } from '../../types';
import { getRawSwapQuote } from './quote-swap';

/**
 * Execute Swap Operation
 *
 * Builds and executes swap transactions on Meteora DLMM pools.
 */
export class ExecuteSwapOperation implements OperationBuilder<ExecuteSwapParams, ExecuteSwapResult> {
  constructor(
    private meteora: any, // Meteora connector
    private solana: any,  // Solana chain
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: ExecuteSwapParams): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!params.walletAddress) errors.push('Wallet address is required');
    if (!params.poolAddress) errors.push('Pool address is required');
    if (!params.tokenIn) errors.push('Token in is required');
    if (!params.tokenOut) errors.push('Token out is required');
    if (!params.amountIn && !params.amountOut) errors.push('Either amountIn or amountOut must be provided');

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
      const transaction = await this.build(params);

      // Simulate on-chain
      await this.solana.connection.simulateTransaction(transaction.raw);

      return {
        success: true,
        changes: {
          balanceChanges: [
            { token: params.tokenIn, amount: (params.amountIn || 0).toString(), direction: 'out' },
            { token: params.tokenOut, amount: (params.amountOut || 0).toString(), direction: 'in' },
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
  async build(params: ExecuteSwapParams): Promise<SDKTransaction> {
    const {
      walletAddress,
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      slippagePct = 1,
    } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const side = amountOut ? 'BUY' : 'SELL';
    const amount = (amountOut || amountIn)!;

    // Get token info
    const inputToken = await this.solana.getToken(tokenIn);
    const outputToken = await this.solana.getToken(tokenOut);

    if (!inputToken || !outputToken) {
      throw new Error(`Token not found: ${!inputToken ? tokenIn : tokenOut}`);
    }

    // Get swap quote
    const { swapAmount, quote, dlmmPool } = await getRawSwapQuote(
      this.meteora,
      this.solana,
      poolAddress,
      inputToken,
      outputToken,
      amount,
      side,
      slippagePct,
    );

    // Build swap transaction
    const swapTx =
      side === 'BUY'
        ? await dlmmPool.swapExactOut({
            inToken: new PublicKey(inputToken.address),
            outToken: new PublicKey(outputToken.address),
            outAmount: (quote as SwapQuoteExactOut).outAmount,
            maxInAmount: (quote as SwapQuoteExactOut).maxInAmount,
            lbPair: dlmmPool.pubkey,
            user: wallet.publicKey,
            binArraysPubkey: (quote as SwapQuoteExactOut).binArraysPubkey,
          })
        : await dlmmPool.swap({
            inToken: new PublicKey(inputToken.address),
            outToken: new PublicKey(outputToken.address),
            inAmount: swapAmount,
            minOutAmount: (quote as SwapQuote).minOutAmount,
            lbPair: dlmmPool.pubkey,
            user: wallet.publicKey,
            binArraysPubkey: (quote as SwapQuote).binArraysPubkey,
          });

    return {
      raw: swapTx,
      description: `Swap ${tokenIn} for ${tokenOut} on Meteora`,
    };
  }

  /**
   * Execute transaction
   */
  async execute(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
    const {
      walletAddress,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
    } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const side = amountOut ? 'BUY' : 'SELL';

    // Get token info
    const inputToken = await this.solana.getToken(tokenIn);
    const outputToken = await this.solana.getToken(tokenOut);

    // Build transaction
    const transaction = await this.build(params);

    // Send and confirm
    const { signature, fee } = await this.solana.sendAndConfirmTransaction(
      transaction.raw,
      [wallet],
    );

    // Get transaction data
    const txData = await this.solana.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    const confirmed = txData !== null;

    if (confirmed && txData) {
      // Extract balance changes
      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(
        signature,
        wallet.publicKey.toBase58(),
        [inputToken.address, outputToken.address],
      );

      const actualAmountIn = Math.abs(balanceChanges[0]);
      const actualAmountOut = Math.abs(balanceChanges[1]);

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          amountIn: actualAmountIn,
          amountOut: actualAmountOut,
          fee,
          tokenIn: inputToken.address,
          tokenOut: outputToken.address,
        },
      };
    }

    return {
      signature,
      status: 0, // PENDING
    };
  }
}

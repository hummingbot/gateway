/**
 * Raydium CLMM Close Position Operation
 *
 * Implements the OperationBuilder pattern for closing concentrated liquidity positions.
 * Handles positions with remaining liquidity (removes liquidity + collects fees + closes)
 * and empty positions (just closes and refunds rent).
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../core/src/types/protocol';
import { ClosePositionParams, ClosePositionResult } from '../../types/clmm';

/**
 * Close Position Operation
 *
 * Implements OperationBuilder for closing CLMM positions.
 * Automatically handles liquidity removal if position is not empty.
 */
export class ClosePositionOperation
  implements OperationBuilder<ClosePositionParams, ClosePositionResult>
{
  constructor(
    private raydium: any, // Will be typed properly with RaydiumConnector
    private solana: any, // Solana chain instance
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: ClosePositionParams): Promise<ValidationResult> {
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
   * Returns expected tokens to be withdrawn and rent refunded
   */
  async simulate(params: ClosePositionParams): Promise<SimulationResult> {
    try {
      const position = await this.raydium.getClmmPosition(params.positionAddress);
      const hasLiquidity = !position.liquidity.isZero();

      // Get priority fee estimate
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = hasLiquidity ? 600000 : 200000; // More compute if removing liquidity
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      // Estimate position rent refund (approx 0.02 SOL)
      const positionRent = 0.02;

      const balanceChanges: any[] = [
        {
          token: 'SOL',
          amount: positionRent.toString(),
          direction: 'in',
          note: 'Position rent refund',
        },
      ];

      if (hasLiquidity) {
        balanceChanges.push(
          {
            token: 'BASE',
            amount: 'TBD', // Calculated based on liquidity
            direction: 'in',
            note: 'Liquidity withdrawal',
          },
          {
            token: 'QUOTE',
            amount: 'TBD', // Calculated based on liquidity
            direction: 'in',
            note: 'Liquidity withdrawal',
          },
        );
      }

      return {
        success: true,
        changes: {
          balanceChanges,
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
  async build(params: ClosePositionParams): Promise<SDKTransaction> {
    const position = await this.raydium.getClmmPosition(params.positionAddress);
    const [poolInfo, poolKeys] = await this.raydium.getClmmPoolfromAPI(position.poolId.toBase58());

    // Get priority fee
    const hasLiquidity = !position.liquidity.isZero();
    const COMPUTE_UNITS = hasLiquidity ? 600000 : 200000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    let transaction: VersionedTransaction;

    if (hasLiquidity) {
      // Use decreaseLiquidity with closePosition flag
      const result = await this.raydium.raydiumSDK.clmm.decreaseLiquidity({
        poolInfo,
        poolKeys,
        ownerPosition: position,
        ownerInfo: {
          useSOLBalance: true,
          closePosition: true, // This closes position after removing liquidity
        },
        liquidity: position.liquidity, // Remove all liquidity
        amountMinA: position.amountA.mul(0).toBuffer(), // Accept any amount (zero minimum)
        amountMinB: position.amountB.mul(0).toBuffer(),
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      });
      transaction = result.transaction;
    } else {
      // Empty position - just close and burn NFT
      const result = await this.raydium.raydiumSDK.clmm.closePosition({
        poolInfo,
        poolKeys,
        ownerPosition: position,
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      });
      transaction = result.transaction;
    }

    // Calculate estimated fee
    const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

    return {
      raw: transaction,
      description: `Close CLMM position ${params.positionAddress}`,
      estimatedFee: {
        amount: estimatedFee.toString(),
        token: 'SOL',
      },
    };
  }

  /**
   * Execute transaction (signs and submits)
   */
  async execute(params: ClosePositionParams): Promise<ClosePositionResult> {
    const position = await this.raydium.getClmmPosition(params.positionAddress);
    const hasLiquidity = !position.liquidity.isZero();

    // Handle positions with liquidity differently
    if (hasLiquidity) {
      return await this.executeWithLiquidity(params, position);
    } else {
      return await this.executeEmptyPosition(params, position);
    }
  }

  /**
   * Execute close for position with remaining liquidity
   */
  private async executeWithLiquidity(params: ClosePositionParams, position: any): Promise<ClosePositionResult> {
    // Use removeLiquidity helper from route file temporarily
    const { removeLiquidity } = await import(
      '../../../../../../src/connectors/raydium/clmm-routes/removeLiquidity'
    );

    const removeLiquidityResponse = await removeLiquidity(
      null,
      params.network,
      params.walletAddress,
      params.positionAddress,
      100, // Remove 100% of liquidity
      true, // closePosition flag
    );

    if (removeLiquidityResponse.status === 1 && removeLiquidityResponse.data) {
      const [poolInfo] = await this.raydium.getClmmPoolfromAPI(position.poolId.toBase58());
      const baseTokenInfo = await this.solana.getToken(poolInfo.mintA.address);
      const quoteTokenInfo = await this.solana.getToken(poolInfo.mintB.address);

      // Extract balance changes
      const { baseTokenChange, quoteTokenChange, rent } =
        await this.solana.extractClmmBalanceChanges(
          removeLiquidityResponse.signature,
          params.walletAddress,
          baseTokenInfo,
          quoteTokenInfo,
          removeLiquidityResponse.data.fee * 1e9,
        );

      // Calculate fees collected (total change - liquidity removed)
      const baseFeeCollected = Math.abs(baseTokenChange) - removeLiquidityResponse.data.baseTokenAmountRemoved;
      const quoteFeeCollected = Math.abs(quoteTokenChange) - removeLiquidityResponse.data.quoteTokenAmountRemoved;

      return {
        signature: removeLiquidityResponse.signature,
        status: 1, // CONFIRMED
        data: {
          fee: removeLiquidityResponse.data.fee,
          positionRentReclaimed: rent,
          baseTokenAmountRemoved: removeLiquidityResponse.data.baseTokenAmountRemoved,
          quoteTokenAmountRemoved: removeLiquidityResponse.data.quoteTokenAmountRemoved,
          feesCollected: {
            base: Math.max(0, baseFeeCollected),
            quote: Math.max(0, quoteFeeCollected),
          },
        },
      };
    } else {
      return {
        signature: removeLiquidityResponse.signature,
        status: 0, // PENDING
      };
    }
  }

  /**
   * Execute close for empty position (just burn NFT and reclaim rent)
   */
  private async executeEmptyPosition(params: ClosePositionParams, position: any): Promise<ClosePositionResult> {
    const [poolInfo, poolKeys] = await this.raydium.getClmmPoolfromAPI(position.poolId.toBase58());

    // Get priority fee
    const COMPUTE_UNITS = 200000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    const result = await this.raydium.raydiumSDK.clmm.closePosition({
      poolInfo,
      poolKeys,
      ownerPosition: position,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    });

    // Prepare wallet
    const { wallet, isHardwareWallet } = await this.raydium.prepareWallet(params.walletAddress);

    // Sign transaction
    const signedTransaction = (await this.raydium.signTransaction(
      result.transaction,
      params.walletAddress,
      isHardwareWallet,
      wallet,
    )) as VersionedTransaction;

    // Send and confirm
    const { confirmed, signature, txData } = await this.solana.sendAndConfirmRawTransaction(
      signedTransaction,
    );

    if (confirmed && txData) {
      const fee = txData.meta.fee / 1e9;

      // Extract SOL balance change (rent refund)
      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(signature, params.walletAddress, [
        'So11111111111111111111111111111111111111112',
      ]);
      const rentRefunded = Math.abs(balanceChanges[0]);

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee,
          positionRentReclaimed: rentRefunded,
          baseTokenAmountRemoved: 0,
          quoteTokenAmountRemoved: 0,
          feesCollected: {
            base: 0,
            quote: 0,
          },
        },
      };
    } else {
      return {
        signature,
        status: 0, // PENDING
      };
    }
  }
}
